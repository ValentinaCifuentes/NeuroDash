import yaml
from pathlib import Path
from engine.schemas import ConfidenceLevel

def calculate_confidence(missingness: list[dict], config_path: Path | str | None = None) -> ConfidenceLevel:
    """
    Calculates confidence level based on missingness coverage of features.
    Confidence is monotonic with coverage.
    """
    # Default thresholds if config is missing/unreadable
    high_threshold = 0.8
    medium_threshold = 0.6
    low_threshold = 0.4
    core_fields: list[str] | None = None

    def _apply_config(cfg: dict) -> None:
        nonlocal high_threshold, medium_threshold, low_threshold, core_fields
        high_threshold = cfg.get("high_threshold", high_threshold)
        medium_threshold = cfg.get("medium_threshold", medium_threshold)
        low_threshold = cfg.get("low_threshold", low_threshold)
        configured_core = cfg.get("core_fields")
        if isinstance(configured_core, list):
            core_fields = [str(field) for field in configured_core]

    if config_path is not None:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f)
                if cfg:
                    _apply_config(cfg)
        except Exception:
            pass
    else:
        # Check standard config path
        proj_root = Path(__file__).resolve().parents[2]
        std_config = proj_root / "config" / "confidence.yaml"
        if std_config.exists():
            try:
                with open(std_config, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f)
                    if cfg:
                        _apply_config(cfg)
            except Exception:
                pass

    if not missingness:
        return ConfidenceLevel.HIGH

    # Si la configuración define core_fields, la cobertura se mide solo sobre esos
    # campos núcleo (sueño, despertar, eventos) para que los campos opcionales no
    # diluyan artificialmente la confianza.
    if core_fields:
        core_missingness = [m for m in missingness if m.get("field") in core_fields]
        if core_missingness:
            missingness = core_missingness

    missing_count = sum(1 for m in missingness if m.get("missing", False))
    total_count = len(missingness)
    coverage = (total_count - missing_count) / total_count

    if coverage >= high_threshold:
        return ConfidenceLevel.HIGH
    elif coverage >= medium_threshold:
        return ConfidenceLevel.MEDIUM
    elif coverage >= low_threshold:
        return ConfidenceLevel.LOW
    else:
        return ConfidenceLevel.INSUFFICIENT
