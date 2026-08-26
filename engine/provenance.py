from typing import Any

def build_provenance(
    subject_id: str,
    has_school_records: bool,
    lineage: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Constructs provenance tracking metadata for a prediction.
    Explicitly tracks the exclusion of school records from current CORE inputs.
    """
    prov = {
        "subject_id": subject_id,
        "excluded_from_core": has_school_records,
        "lineage": lineage or {}
    }
    
    if has_school_records:
        prov["exclusion_reason"] = "School records were excluded from CORE predictor inputs."
    else:
        prov["exclusion_reason"] = None
        
    return prov
