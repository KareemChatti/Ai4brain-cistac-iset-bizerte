import json
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[3]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    """Tests never call the real API, and read the fixture evidence instead of the database."""
    monkeypatch.setenv("COACH_LLM_DISABLED", "1")
    from app.coach import cache, data

    sheet = json.loads((BACKEND.parent / "shared" / "fixtures" / "evidence.json").read_text())
    monkeypatch.setattr(data, "get_evidence", lambda user_id, round_id: {**sheet, "round_id": round_id})
    monkeypatch.setattr(cache, "_engine", lambda: None)
    cache.clear_memory()
