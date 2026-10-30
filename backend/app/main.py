"""FastAPI application: `uvicorn app.main:app --reload` from backend/."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app import __version__, db
from app.config import settings
from app import demo, live, retention
from app.routers import data, events, insights, matches, profile, users

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    db.init_db()
    if settings.seed_demo:
        await asyncio.to_thread(demo.seed_demo)
    cleanup = asyncio.create_task(retention.retention_loop())  # now, then once a day
    yield
    cleanup.cancel()


class BeaconJSONMiddleware:
    """Treat POST /api/events bodies as JSON whatever their Content-Type.

    `navigator.sendBeacon` (used on page hide) sends text/plain to avoid a CORS
    preflight, which FastAPI would otherwise refuse to parse.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] == "POST" and scope["path"] == "/api/events":
            headers = [(k, v) for k, v in scope["headers"] if k != b"content-type"]
            scope = {**scope, "headers": [*headers, (b"content-type", b"application/json")]}
        await self.app(scope, receive, send)


app = FastAPI(
    title="AI4Brain × Rami API",
    version=__version__,
    description="Events, Brain Twin profile, plan, collaboration score and data rights. "
    "Contract: docs/contracts.md.",
    lifespan=lifespan,
)
app.add_middleware(BeaconJSONMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(users.router)
app.include_router(events.router)
app.include_router(profile.router)
app.include_router(data.router)
app.include_router(insights.router)
app.include_router(matches.router)
app.include_router(live.router)

# The coach (Member 3) lives in app/coach/. A missing or broken coach must never
# stop the rest of the API from starting.
try:
    from app.coach.router import router as coach_router
except Exception as exc:  # noqa: BLE001
    log.warning("Coach router not loaded (%s: %s)", type(exc).__name__, exc)
else:
    app.include_router(coach_router)


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, object]:
    """Server status, and whether the coach's language model can answer (see app/coach/llm.py)."""
    try:
        from app.coach.llm import status as coach_status

        coach = coach_status()
    except Exception as exc:  # noqa: BLE001  (a missing coach must not break the health check)
        coach = {"ready": False, "detail": f"coach not loaded ({type(exc).__name__})"}
    return {"status": "ok", "version": __version__, "coach_llm": coach}
