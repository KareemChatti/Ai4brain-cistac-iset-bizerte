from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

_engine: Engine | None = None


def configure(url: str | None = None) -> Engine:
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

    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    if _engine is not None:
        _engine.dispose()
    _engine = engine
    return engine


def get_engine() -> Engine:
    return _engine if _engine is not None else configure()


def init_db() -> None:
    SQLModel.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
