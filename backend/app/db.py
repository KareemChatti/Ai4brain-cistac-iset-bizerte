"""Database engine and sessions.

Request handlers get a session through the `get_session` dependency. Plain functions
that other modules call directly (for example the coach calling `build_evidence`)
open their own with `session_scope()`.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

_engine: Engine | None = None


def configure(url: str | None = None) -> Engine:
    """Create the engine for `url` (default from settings) and create missing tables.

    Tests call `configure("sqlite://")` for a fresh in-memory database.
    """
    global _engine
    url = url or settings.database_url
    kwargs: dict = {}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
    engine = create_engine(url, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    import app.models  # noqa: F401  (registers the tables on SQLModel.metadata)

    SQLModel.metadata.create_all(engine)
    if _engine is not None:
        _engine.dispose()
    _engine = engine
    return engine


def get_engine() -> Engine:
    return _engine if _engine is not None else configure()


def init_db() -> None:
    """Create any tables registered after the engine was made (e.g. the coach's)."""
    SQLModel.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
