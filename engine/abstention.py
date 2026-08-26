import yaml
from pathlib import Path
from engine.schemas import ConfidenceLevel

CONFIDENCE_ORDER = {
    ConfidenceLevel.INSUFFICIENT: 0,
    ConfidenceLevel.LOW: 1,
    ConfidenceLevel.MEDIUM: 2,
    ConfidenceLevel.HIGH: 3
}

def should_abstain(
    baseline_maturity: int,
    confidence: ConfidenceLevel,
    config_path: Path | str | None = None
) -> tuple[bool, str | None]:
    """
    Determines if prediction should abstain based on baseline maturity and confidence level.
    """
    min_baseline_maturity = 3
    required_confidence = ConfidenceLevel.LOW

    if config_path is not None:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f)
                if cfg:
                    min_baseline_maturity = cfg.get("min_baseline_maturity", min_baseline_maturity)
                    req_conf_str = cfg.get("required_confidence", "LOW")
                    required_confidence = ConfidenceLevel(req_conf_str)
        except Exception:
            pass
    else:
        # Check standard config path
        proj_root = Path(__file__).resolve().parents[2]
        std_config = proj_root / "config" / "abstention.yaml"
        if std_config.exists():
            try:
                with open(std_config, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f)
                    if cfg:
                        min_baseline_maturity = cfg.get("min_baseline_maturity", min_baseline_maturity)
                        req_conf_str = cfg.get("required_confidence", "LOW")
                        required_confidence = ConfidenceLevel(req_conf_str)
            except Exception:
                pass

    # Check baseline maturity
    if baseline_maturity < min_baseline_maturity:
        return True, f"Insufficient baseline maturity ({baseline_maturity} days). Minimum required is {min_baseline_maturity} days."

    # Check confidence level
    conf_value = CONFIDENCE_ORDER.get(confidence, 0)
    req_value = CONFIDENCE_ORDER.get(required_confidence, 1)
    if conf_value < req_value:
        return True, f"Confidence level {confidence.value} is below the required threshold of {required_confidence.value}."

    return False, None
