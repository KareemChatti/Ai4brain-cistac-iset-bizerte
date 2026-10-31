from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy import Table, delete, select
from sqlmodel import Session, SQLModel

from app.db import get_session
from app.models import DeletedUser, User
from app.privacy import user_hash
from app.schemas import Deleted
from app.timeutil import iso, utcnow

router = APIRouter(prefix="/api/data", tags=["data"])


def user_tables() -> list[Table]:
    return [
        table for table in SQLModel.metadata.sorted_tables
        if "user_id" in table.c and table.name != User.__tablename__
    ]


@router.get("/{user_id}/export")
def export_data(user_id: UUID, session: Session = Depends(get_session)) -> JSONResponse:
    uid = str(user_id)
    user = session.get(User, uid)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown user")

    dump: dict[str, Any] = {"exported_at": iso(utcnow()), "user": _plain(user.model_dump())}
    for table in user_tables():
        order = table.c.ts if "ts" in table.c else list(table.primary_key.columns)[0]
        rows = session.connection().execute(select(table).where(table.c.user_id == uid).order_by(order))
        dump[table.name] = [_plain(dict(row)) for row in rows.mappings()]

    return JSONResponse(
        dump,
        headers={"Content-Disposition": f'attachment; filename="ai4brain-export-{uid[:8]}.json"'},
    )


@router.delete("/{user_id}", response_model=Deleted)
def delete_data(user_id: UUID, session: Session = Depends(get_session)) -> Deleted:
    delete_user_data(session, str(user_id))
    session.commit()
    return Deleted()


def delete_user_data(session: Session, uid: str) -> None:
    connection = session.connection()
    for table in reversed(user_tables()):
        connection.execute(delete(table).where(table.c.user_id == uid))
    connection.execute(delete(User.__table__).where(User.__table__.c.user_id == uid))
    session.merge(DeletedUser(user_hash=user_hash(uid)))


def _plain(row: dict[str, Any]) -> dict[str, Any]:
    return {key: iso(value) if isinstance(value, datetime) else value for key, value in row.items()}
