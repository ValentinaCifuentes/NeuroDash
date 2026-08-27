import pytest
from pathlib import Path
import json
from datetime import datetime, timezone

# We import the scripts we are going to implement
# At first, this will fail if the scripts do not exist or their functions aren't defined.
try:
    from scripts.validate_source_data import validate_schema
    from scripts.generate_mock_histories import generate_all_histories
    from scripts.train_demo_models import train_all_models
    from scripts.smoke_demo import run_smoke_test
except ImportError:
    # During the RED phase of TDD, we expect these imports might fail if the modules are completely missing.
    # We define dummy placeholders to let the test compile and fail during execution, or let it fail on import.
    pass


def test_reproducibility_pipeline(tmp_path: Path) -> None:
    """
    Verifies the end-to-end reproducibility pipeline:
    1. Generate mock histories for PAC-A, PAC-B, and PAC-C in a temp directory.
    2. Validate the generated source data against the schemas.
    3. Train the models. PAC-A and PAC-B should train successfully. PAC-C should fail due to insufficient data.
    4. Run predictions/abstentions and verify correct behavior.
    """
    # Define test directories
    data_dir = tmp_path / "data"
    models_dir = tmp_path / "models"
    config_dir = tmp_path / "config"
    
    data_dir.mkdir()
    models_dir.mkdir()
    config_dir.mkdir()
    
    # Write mock configurations
    with open(config_dir / "risk_mapping.yaml", "w", encoding="utf-8") as f:
        f.write("low_threshold: 0.3\nhigh_threshold: 0.7\n")
    with open(config_dir / "promotion.yaml", "w", encoding="utf-8") as f:
        f.write("min_validation_accuracy: 0.5\n")
    with open(config_dir / "support_catalog.yaml", "w", encoding="utf-8") as f:
        f.write("- id: cat_1\n  category: general\n  description: Regular routine\n")
        
    # Step 1: Generate histories
    # PAC-A: 30 days (sufficient)
    # PAC-B: 30 days (sufficient)
    # PAC-C: 2 days (insufficient for training)
    from scripts.generate_mock_histories import generate_subject_history
    
    generate_subject_history("PAC-A", days=30, seed=1001, out_dir=data_dir)
    generate_subject_history("PAC-B", days=30, seed=1002, out_dir=data_dir)
    generate_subject_history("PAC-C", days=2, seed=1003, out_dir=data_dir) # Insufficient
    
    # Assert histories were generated
    assert (data_dir / "bluba" / "PAC-A_history.json").exists()
    assert (data_dir / "bluba" / "PAC-B_history.json").exists()
    assert (data_dir / "bluba" / "PAC-C_history.json").exists()
    
    # Step 2: Validate generated source data
    from scripts.validate_source_data import validate_schema
    assert validate_schema(data_dir / "bluba" / "PAC-A_history.json") is True
    assert validate_schema(data_dir / "bluba" / "PAC-B_history.json") is True
    assert validate_schema(data_dir / "bluba" / "PAC-C_history.json") is True
    
    # Step 3: Train models
    from scripts.train_demo_models import train_subject_model
    
    # PAC-A and PAC-B should train successfully
    meta_a = train_subject_model("PAC-A", data_dir=data_dir, models_dir=models_dir)
    assert meta_a is not None
    assert meta_a["samples_count"] >= 5
    
    meta_b = train_subject_model("PAC-B", data_dir=data_dir, models_dir=models_dir)
    assert meta_b is not None
    assert meta_b["samples_count"] >= 5
    
    # PAC-C should fail training due to insufficient data
    from ml.trainer import InsufficientDataError
    with pytest.raises(InsufficientDataError):
        train_subject_model("PAC-C", data_dir=data_dir, models_dir=models_dir)
        
    # Verify model files
    assert (models_dir / "PAC-A" / "registry.json").exists()
    assert (models_dir / "PAC-B" / "registry.json").exists()
    assert not (models_dir / "PAC-C" / "registry.json").exists()
    
    # Step 4: Run smoke demo prediction and validation
    from scripts.smoke_demo import execute_smoke_run
    
    # PAC-A and PAC-B should predict successfully
    contract_a = execute_smoke_run("PAC-A", data_dir=data_dir, models_dir=models_dir, config_dir=config_dir)
    assert contract_a.subject_id == "PAC-A"
    assert contract_a.abstained is False
    assert contract_a.risk in ["LOW", "MEDIUM", "HIGH"]
    assert "model_score" not in contract_a.model_dump(mode="json")
    
    contract_b = execute_smoke_run("PAC-B", data_dir=data_dir, models_dir=models_dir, config_dir=config_dir)
    assert contract_b.subject_id == "PAC-B"
    assert contract_b.abstained is False
    assert contract_b.risk in ["LOW", "MEDIUM", "HIGH"]
    assert "model_score" not in contract_b.model_dump(mode="json")
    
    # PAC-C should abstain correctly
    contract_c = execute_smoke_run("PAC-C", data_dir=data_dir, models_dir=models_dir, config_dir=config_dir)
    assert contract_c.subject_id == "PAC-C"
    assert contract_c.abstained is True
    assert contract_c.risk is None
    assert "model_score" not in contract_c.model_dump(mode="json")
