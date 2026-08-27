import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from ml.promotion import write_json_atomic


class SubjectRepository:
    """Small subject-profile store used by the onboarding slice only."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def save(self, profile: dict[str, Any]) -> dict[str, Any]:
        directory = self.root / profile["subject_id"]
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "profile.json"
        if path.exists():
            existing = self.get(profile["subject_id"])
            normalized = {**existing, **profile}
            write_json_atomic(path, normalized)
            return normalized
        write_json_atomic(path, profile)
        return profile

    def get(self, subject_id: str) -> dict[str, Any]:
        path = self.root / subject_id / "profile.json"
        if not path.exists():
            raise KeyError(subject_id)
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def selection_profile(profile: dict[str, Any]) -> dict[str, Any]:
        subject_id = profile["subject_id"]
        display_name = profile.get("display_name", subject_id)
        return {
            "contract_version": profile.get("contract_version", "2.0"),
            "subject_id": subject_id,
            "display_name": display_name,
            "initials": profile.get("initials", "".join(part[0] for part in display_name.split()[:2]).upper() or "?"),
            "timezone": profile.get("timezone", "UTC"),
            "cold_start": profile.get("cold_start", True),
            "provisional_baseline": profile.get("baseline", {}),
            "provenance": profile.get("provenance", {"source": "legacy_profile", "synthetic": False}),
        }

    def list(self) -> list[dict[str, Any]]:
        if not self.root.exists():
            return []
        profiles = []
        for path in self.root.glob("*/profile.json"):
            try:
                profiles.append(self.selection_profile(json.loads(path.read_text(encoding="utf-8"))))
            except json.JSONDecodeError:
                continue
        return sorted(profiles, key=lambda profile: profile["display_name"].casefold())


class CareRecordRepository:
    """Subject-scoped JSON persistence with replay-key idempotency."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def _path(self, subject_id: str, collection: str) -> Path:
        path = self.root / subject_id / f"{collection}.json"
        if not (self.root / subject_id / "profile.json").exists():
            raise KeyError(subject_id)
        return path

    def save(self, subject_id: str, collection: str, item: dict[str, Any], id_field: str) -> dict[str, Any]:
        path = self._path(subject_id, collection)
        existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        for saved in existing:
            if saved.get("idempotency_key") == item["idempotency_key"]:
                return saved
        item = {**item, id_field: uuid.uuid4().hex}
        existing.append(item)
        write_json_atomic(path, existing)
        return item

    def list(self, subject_id: str, collection: str) -> list[dict[str, Any]]:
        path = self._path(subject_id, collection)
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
