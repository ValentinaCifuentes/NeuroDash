import yaml
from pathlib import Path
from typing import Any

def select_supports(
    subject_history: list[dict[str, Any]],
    sensory_context: dict[str, Any],
    config_path: Path | str | None = None
) -> list[dict[str, Any]]:
    """
    Selects evidence-bounded supports:
    1. Historical matches from subject history first.
    2. Context-specific supports from catalog (sensory/habit matches).
    3. General supports from catalog if no history or context-specific matches exist.
    4. Fallback "no-evidence" support if nothing else is available.
    """
    catalog = []
    if config_path is not None:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                catalog = yaml.safe_load(f) or []
        except Exception:
            pass
    else:
        # Check standard config path
        proj_root = Path(__file__).resolve().parents[2]
        std_config = proj_root / "config" / "support_catalog.yaml"
        if std_config.exists():
            try:
                with open(std_config, "r", encoding="utf-8") as f:
                    catalog = yaml.safe_load(f) or []
            except Exception:
                pass

    selected = []

    # 1. Historical supports
    for hist in subject_history:
        selected.append({
            "id": hist.get("id"),
            "description": hist.get("description"),
            "type": "historical",
            "category": hist.get("category", "general")
        })

    # 2. Context-specific catalog supports
    context_matches = []
    general_entries = []
    
    # We look through sensory_context values to check for matches
    context_values = []
    for val in sensory_context.values():
        if isinstance(val, str):
            context_values.append(val.lower())

    for entry in catalog:
        sensory_trigger = entry.get("sensory_profile_contains")
        habit_trigger = entry.get("habit_profile_contains")
        
        is_contextual = False
        matched = False
        
        if sensory_trigger:
            is_contextual = True
            if any(sensory_trigger.lower() in cv for cv in context_values):
                matched = True
                
        if habit_trigger:
            is_contextual = True
            if any(habit_trigger.lower() in cv for cv in context_values):
                matched = True

        if is_contextual:
            if matched:
                context_matches.append({
                    "id": entry.get("id"),
                    "description": entry.get("description"),
                    "type": "catalog",
                    "category": entry.get("category", "general")
                })
        else:
            general_entries.append({
                "id": entry.get("id"),
                "description": entry.get("description"),
                "type": "catalog",
                "category": entry.get("category", "general")
            })

    # Add context matches if found
    if context_matches:
        selected.extend(context_matches)
    
    # If no history and no context matches, add general catalog entries
    elif not selected and general_entries:
        selected.extend(general_entries)

    # 3. Fallback if still empty
    if not selected:
        selected.append({
            "id": "fallback_no_evidence",
            "description": "No evidence-based supports available.",
            "type": "fallback",
            "category": "general"
        })

    return selected
