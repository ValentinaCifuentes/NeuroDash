import csv
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Mapping, Protocol

import joblib


class DataProvider(Protocol):
    def read_csv(self) -> list[dict[str, str]]: ...
    def read_json(self, path: Path) -> Any: ...
    def write_json_atomic(self, path: Path, value: Any) -> None: ...
    def load_joblib(self, path: Path) -> Any: ...
    def dump_joblib(self, path: Path, value: Any) -> None: ...


class CsvJsonDataProvider:
    def __init__(self, csv_path: Path, audit_path: Path) -> None:
        self.csv_path, self.audit_path = csv_path, audit_path

    def read_csv(self) -> list[dict[str, str]]:
        with self.csv_path.open(newline="", encoding="utf-8") as source:
            return list(csv.DictReader(source))

    def read_json(self, path: Path) -> Any:
        with path.open(encoding="utf-8") as source:
            return json.load(source)

    def write_json_atomic(self, path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
            json.dump(value, temporary, sort_keys=True)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_path = Path(temporary.name)
        os.replace(temporary_path, path)

    def append_audit(self, record: Mapping[str, Any]) -> None:
        if not isinstance(record, Mapping):
            raise TypeError("Audit record must be an object.")
        entries = self.read_json(self.audit_path) if self.audit_path.exists() else []
        if not isinstance(entries, list):
            raise ValueError("Audit file must contain a list.")
        self.write_json_atomic(self.audit_path, [*entries, dict(record)])

    def load_joblib(self, path: Path) -> Any:
        return joblib.load(path)

    def dump_joblib(self, path: Path, value: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(value, path)
