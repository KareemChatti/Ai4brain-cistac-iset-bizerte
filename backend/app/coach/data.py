"""Reads Member 2's data through their functions only. Until those exist, falls back to shared/fixtures/."""

import importlib
import json
from pathlib import Path
from typing import Any, Callable

FIXTURES = Path(__file__).resolve().parents[3] / "shared" / "fixtures"
# Where Member 2's helpers may live; the first module that has the function wins.
M2_MODULES = ["app.evidence", "app.scoring.twin", "app.routers.profile", "app.scoring"]


def _m2(name: str) -> Callable[..., Any] | None:
    for mod_name in M2_MODULES:
        try:
            fn = getattr(importlib.import_module(mod_name), name, None)
        except ImportError:
            continue
        if callable(fn):
            return fn
    return None


def _plain(obj: Any) -> Any:
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if isinstance(obj, list):
        return [_plain(o) for o in obj]
    return obj


def _fixture(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def get_evidence(user_id: str, round_id: str) -> dict:
    """The evidence sheet for one round. Raises LookupError when the round does not exist."""
    build = _m2("build_evidence")
    if build is None:
        sheet = _fixture("evidence.json")
        return {**sheet, "user_id": user_id, "round_id": round_id}
    sheet = build(user_id, round_id)
    if sheet is None:
        raise LookupError(round_id)
    return _plain(sheet)


def get_profile(user_id: str) -> dict | None:
    fn = _m2("get_profile")
    if fn is None:
        return _fixture("profile.json")
    try:
        return _plain(fn(user_id))
    except LookupError:
        return None


def recent_evidence(user_id: str, n: int = 3) -> list[dict]:
    recent = _m2("recent_round_ids")
    if recent is None or _m2("build_evidence") is None:
        return [_fixture("evidence.json")]
    sheets = []
    for rid in recent(user_id, n=n):
        try:
            sheets.append(get_evidence(user_id, rid))
        except LookupError:
            continue
    return sheets
