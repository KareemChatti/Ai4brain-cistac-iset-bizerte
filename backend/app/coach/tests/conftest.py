import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[3]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    """Tests never call the real API."""
    monkeypatch.setenv("COACH_LLM_DISABLED", "1")
    from app.coach import cache

    cache.clear_memory()
