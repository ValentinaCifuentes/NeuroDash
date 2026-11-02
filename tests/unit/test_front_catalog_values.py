"""Los `value` del catálogo del front deben coincidir con los mapas de codificación del backend.

Si un texto cambia en un lado y no en el otro, el backend deja de convertirlo en número
y ese dato desaparece del modelo sin ningún error visible.
"""

import re
from pathlib import Path

from backend.app.routes import subjects

CATALOG = Path(__file__).resolve().parents[2] / "front" / "src" / "domain" / "catalog.ts"

# Constante del catálogo → mapa del backend que la codifica.
ENCODED_CHOICES = {
    "SLEEP_CHOICES": subjects.SLEEP_QUALITY_MAP,
    "WAKE_CHOICES": subjects.WAKE_STATE_MAP,
    "START_AUTONOMY_CHOICES": subjects.START_AUTONOMY_MAP,
    "GI_CHOICES": subjects.GI_LEVEL_MAP,
    "DAY_REGULATION_CHOICES": subjects.DAY_REGULATION_MAP,
}


def _values(constant: str) -> list[str]:
    source = CATALOG.read_text(encoding="utf-8")
    block = re.search(rf"export const {constant}\b[^=]*= \[(.*?)\n\];", source, re.S)
    assert block, f"{constant} no está en catalog.ts"
    return re.findall(r"value: '([^']+)'", block.group(1))


def test_every_catalog_value_is_encoded_by_the_backend() -> None:
    for constant, mapping in ENCODED_CHOICES.items():
        values = _values(constant)
        encoded = {subjects._normalize_label(label) for label in mapping}
        assert len(values) == 3, constant
        missing = [value for value in values if subjects._normalize_label(value) not in encoded]
        assert missing == [], f"{constant}: el backend no codifica {missing}"


def test_catalog_values_keep_the_exact_backend_spelling() -> None:
    """Además de coincidir normalizados, se mantienen letra por letra (tildes y mayúsculas)."""
    for constant, mapping in ENCODED_CHOICES.items():
        assert set(_values(constant)) <= set(mapping), constant
