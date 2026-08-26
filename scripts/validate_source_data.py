import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Any


def validate_schema(file_path: Path | str) -> bool:
    """
    Validates the structure and data types of a subject history JSON file.
    Returns True if valid, False otherwise.
    """
    path = Path(file_path)
    if not path.exists():
        print(f"Error: File {path} does not exist.")
        return False
        
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error: Failed to parse JSON file {path}: {e}")
        return False

    if not isinstance(data, dict):
        print("Error: Root elements must be a JSON object.")
        return False

    # Check top-level keys
    for key in ["records", "occurrences", "lineage"]:
        if key not in data:
            print(f"Error: Missing top-level key '{key}' in history.")
            return False

    # Validate records list
    records = data["records"]
    if not isinstance(records, list):
        print("Error: 'records' must be a list.")
        return False

    for idx, record in enumerate(records):
        if not isinstance(record, dict):
            print(f"Error: Record at index {idx} is not an object.")
            return False
            
        # Required record keys
        for req_key in ["id", "subject_id", "source_timestamp", "availability_timestamp"]:
            if req_key not in record:
                print(f"Error: Record {idx} missing required key '{req_key}'.")
                return False
            if not isinstance(record[req_key], str):
                print(f"Error: Record {idx} field '{req_key}' must be a string.")
                return False
                
        # Validate timestamp formats
        for ts_key in ["source_timestamp", "availability_timestamp"]:
            try:
                datetime.fromisoformat(record[ts_key])
            except ValueError:
                print(f"Error: Record {idx} field '{ts_key}' has invalid ISO timestamp format: {record[ts_key]}")
                return False

        # Optional numeric fields
        for num_key in ["sleep_quality", "wake_state", "event_count"]:
            if num_key in record:
                val = record[num_key]
                if val is not None and not isinstance(val, (int, float)):
                    print(f"Error: Record {idx} field '{num_key}' must be numeric or null. Got {type(val)}")
                    return False

    # Validate occurrences list
    occurrences = data["occurrences"]
    if not isinstance(occurrences, list):
        print("Error: 'occurrences' must be a list.")
        return False

    for idx, occ in enumerate(occurrences):
        if not isinstance(occ, dict):
            print(f"Error: Occurrence at index {idx} is not an object.")
            return False

        # Required occurrence keys
        for req_key in ["id", "subject_id", "source_timestamp", "availability_timestamp", "severity"]:
            if req_key not in occ:
                print(f"Error: Occurrence {idx} missing required key '{req_key}'.")
                return False
            if not isinstance(occ[req_key], str):
                print(f"Error: Occurrence {idx} field '{req_key}' must be a string.")
                return False

        # Validate timestamp formats
        for ts_key in ["source_timestamp", "availability_timestamp"]:
            try:
                datetime.fromisoformat(occ[ts_key])
            except ValueError:
                print(f"Error: Occurrence {idx} field '{ts_key}' has invalid ISO timestamp: {occ[ts_key]}")
                return False

        # Validate severity level
        severity = occ["severity"].lower()
        if severity not in ["mild", "moderate", "severe"]:
            print(f"Error: Occurrence {idx} field 'severity' must be one of 'mild', 'moderate', 'severe'. Got '{severity}'")
            return False

    # Validate lineage
    lineage = data["lineage"]
    if not isinstance(lineage, dict):
        print("Error: 'lineage' must be a JSON object.")
        return False

    print(f"Success: File '{path.name}' is valid under the NeuraDash CORE schemas.")
    return True


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_source_data.py <path_to_history_json>")
        sys.exit(1)
        
    target_path = sys.argv[1]
    if validate_schema(target_path):
        sys.exit(0)
    else:
        sys.exit(1)
