from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_frontend_dependencies_and_build_output_are_ignored() -> None:
    ignored = (ROOT / ".gitignore").read_text(encoding="utf-8")

    assert "front/node_modules/" in ignored
    assert "front/dist/" in ignored


def test_integration_runbook_documents_safe_api_operation() -> None:
    guide = (ROOT / "docs" / "NeuraDash_Reproducibility_and_Verification_Guide.md").read_text(
        encoding="utf-8"
    )

    assert "## Integration API and Privacy Runbook" in guide
    assert "X-Actor-Id" in guide
    assert "internal_notes" in guide
    assert "prediction cutoff" in guide


def test_integration_runbook_maps_each_sdd_task_to_evidence_and_rollback() -> None:
    guide = (ROOT / "docs" / "NeuraDash_Reproducibility_and_Verification_Guide.md").read_text(
        encoding="utf-8"
    )

    assert "## SDD Integration Traceability" in guide
    for task in ("1.1–1.3", "2.1–2.3", "3.1–3.3", "4.1–4.3", "5.1–5.3"):
        assert task in guide
    assert "Rollback boundary" in guide
