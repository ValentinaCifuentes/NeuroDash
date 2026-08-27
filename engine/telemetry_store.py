"""
JSON-file–based telemetry persistence for NeuraDash.

Follows the same atomic-write pattern used by the CORE ``CsvJsonDataProvider``
so that the telemetry plugin does not introduce any new infrastructure
dependencies.  Each subject gets its own file:

    data/telemetry_{subject_id}.json

The file contains a flat JSON array of observation dicts.
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


class TelemetryStore:
    """
    Append-only JSON store for telemetry observations, scoped per subject.

    Parameters
    ----------
    data_dir : Path
        Directory where ``telemetry_{subject_id}.json`` files are stored.
        Created automatically if it does not exist.
    """

    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._data_dir.mkdir(parents=True, exist_ok=True)

    # -- helpers ----------------------------------------------------------

    def _path_for(self, subject_id: str) -> Path:
        """Return the JSON file path for a given subject."""
        return self._data_dir / f"telemetry_{subject_id}.json"

    @staticmethod
    def _write_atomic(path: Path, data: Any) -> None:
        """
        Atomic write using the same tempfile-then-rename strategy as
        ``CsvJsonDataProvider.write_json_atomic``.
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp"
        ) as tmp:
            json.dump(data, tmp, ensure_ascii=False, indent=2)
            tmp.flush()
            os.fsync(tmp.fileno())
            tmp_path = Path(tmp.name)
        os.replace(tmp_path, path)

    @staticmethod
    def _read_json(path: Path) -> list[dict[str, Any]]:
        """Read a JSON array from *path*, returning ``[]`` if missing."""
        if not path.exists():
            return []
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            return []
        return data

    # -- public API -------------------------------------------------------

    def append_observations(
        self, subject_id: str, observations: list[dict[str, Any]]
    ) -> int:
        """
        Atomically append *observations* to the subject's telemetry file.

        Returns the number of observations appended.
        """
        path = self._path_for(subject_id)
        existing = self._read_json(path)
        existing.extend(observations)
        self._write_atomic(path, existing)
        return len(observations)

    def read_observations(
        self,
        subject_id: str,
        *,
        before: datetime | None = None,
        after: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """
        Read observations for *subject_id*, optionally filtered by time.

        Parameters
        ----------
        before : datetime, optional
            Only include observations with ``timestamp < before``.
        after : datetime, optional
            Only include observations with ``timestamp >= after``.
        """
        path = self._path_for(subject_id)
        records = self._read_json(path)

        if before is None and after is None:
            return records

        filtered: list[dict[str, Any]] = []
        for rec in records:
            ts_raw = rec.get("timestamp")
            if ts_raw is None:
                continue
            ts = datetime.fromisoformat(str(ts_raw))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)

            if before is not None and ts >= before:
                continue
            if after is not None and ts < after:
                continue
            filtered.append(rec)

        return filtered

    def has_recent_data(
        self, subject_id: str, hours: int = 24
    ) -> bool:
        """
        Return ``True`` if the subject has at least one observation within
        the last *hours* hours (relative to UTC now).

        Used by the model selector to decide between core and multimodal.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        recent = self.read_observations(subject_id, after=cutoff)
        return len(recent) > 0

    def count(self, subject_id: str) -> int:
        """Return total observation count for a subject."""
        path = self._path_for(subject_id)
        return len(self._read_json(path))

    def clear(self, subject_id: str) -> None:
        """Delete all telemetry data for a subject (useful for tests)."""
        path = self._path_for(subject_id)
        if path.exists():
            path.unlink()
