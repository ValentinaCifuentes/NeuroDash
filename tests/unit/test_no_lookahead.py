"""Ningún ejemplo de entrenamiento ve lo que pasó después de su hora (paso 5).

Con varias estimaciones por día, el riesgo de hacer trampa es mayor: a las 12:00 el
registro de Mi Día ya tiene los conteos del día completo (la app los actualiza en el
mismo registro) y la crisis de las 18:00 está en los datos. La prueba cambia todo lo
que ocurre o se conoce después del corte y exige que las variables no cambien.
"""
import copy

from engine.baseline import build_baseline
from ml.dataset_builder import CUTOFF_HOURS, build_dataset, build_feature_example, generate_synthetic_history, training_cutoffs
from engine.temporal import AvailabilityPolicy

TZ = "America/Santiago"
HISTORY = generate_synthetic_history("PAC-A", days=40, seed=1020, timezone=TZ)
POLICY = AvailabilityPolicy(daily_regulation="intraday")
# Conteos que la app actualiza en el registro de Mi Día durante el día.
RUNNING_COUNTS = ("event_count", "dysregulation_count", "max_intensity", "trigger_count",
                  "strategy_count", "dysregulation_unresolved", "transition_difficulty",
                  "feeding_difficulty", "sensory_diet_done")


def _features(records, occurrences, cutoff):
    baseline = build_baseline(records, cutoff, policy=POLICY, timezone=TZ)
    feature_set, label = build_feature_example(
        records, occurrences, baseline, cutoff, policy=POLICY, timezone=TZ,
        planned_events=HISTORY["planned_events"],
    )
    return feature_set.rolling_features, label


def _rewrite_the_future(cutoff):
    """Lo que se sabría a la hora del corte, con todo lo posterior alterado."""
    today = cutoff.date()
    records = copy.deepcopy(HISTORY["records"])
    for record in records:
        if record["availability_timestamp"] > cutoff:
            record.update({"sleep_quality": -50.0, "wake_state": 50.0, "day_regulation_level_num": 50})
        if record["source_timestamp"].astimezone(cutoff.tzinfo).date() == today:
            record.update({field: 99 for field in RUNNING_COUNTS})
    occurrences = [
        occurrence for occurrence in HISTORY["occurrences"]
        if occurrence["source_timestamp"] <= cutoff and occurrence["availability_timestamp"] <= cutoff
    ]
    return records, occurrences


def test_changing_what_happens_after_the_cutoff_never_changes_the_features() -> None:
    cutoffs = training_cutoffs(HISTORY["records"], timezone=TZ)
    assert len(cutoffs) > 100

    for cutoff in cutoffs:
        real, _ = _features(HISTORY["records"], HISTORY["occurrences"], cutoff)
        rewritten, _ = _features(*_rewrite_the_future(cutoff), cutoff)
        assert rewritten == real, cutoff.isoformat()


def test_some_examples_already_know_about_today() -> None:
    """La prueba anterior no pasa por no usar lo de hoy: lo de hoy sí entra."""
    examples = [_features(HISTORY["records"], HISTORY["occurrences"], c)[0] for c in training_cutoffs(HISTORY["records"], timezone=TZ)]

    assert any(x["today_record_missing"] == 0.0 for x in examples)
    assert any(x["dysregulation_count_today"] > 0 for x in examples)
    assert any(x["dysregulation_count_today"] == 0 for x in examples)


def test_the_dataset_has_several_estimates_per_day_and_says_so_in_its_lineage() -> None:
    cutoffs = training_cutoffs(HISTORY["records"], timezone=TZ)
    X_train, y_train, X_test, y_test, lineage = build_dataset(
        HISTORY["records"], HISTORY["occurrences"], cutoffs, split_cutoff=cutoffs[-7 * len(CUTOFF_HOURS)],
        policy=POLICY, timezone=TZ, subject_id="PAC-A", planned_events=HISTORY["planned_events"],
    )

    assert len(X_train) + len(X_test) == len(cutoffs)
    assert len(X_test) == 7 * len(CUTOFF_HOURS)
    assert lineage["cutoff_hours"] == list(CUTOFF_HOURS)
    assert lineage["cutoffs_count"] == len(cutoffs)
    assert lineage["policy"]["daily_regulation"] == "intraday"
    # Hay crisis que anticipar en los dos tramos.
    assert any(y_train) and not all(y_train)
