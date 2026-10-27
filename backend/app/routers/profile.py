"""GET /api/profile/{user_id}, its history and its what-if projection."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.models import User
from app.schemas import Profile, Projection, SnapshotOut
from app.scoring.profile import build_history, build_profile
from app.scoring.projection import project

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _require_user(session: Session, user_id: UUID) -> str:
    uid = str(user_id)
    if session.get(User, uid) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown user")
    return uid


@router.get("/{user_id}", response_model=Profile)
def get_profile(user_id: UUID, session: Session = Depends(get_session)) -> Profile:
    """Current Brain Twin: score with its 95% range per dimension."""
    return build_profile(session, _require_user(session, user_id))


@router.get("/{user_id}/history", response_model=list[SnapshotOut])
def get_history(user_id: UUID, session: Session = Depends(get_session)) -> list[SnapshotOut]:
    """The profile after each round or mini-game, oldest first."""
    return build_history(session, _require_user(session, user_id))


@router.get("/{user_id}/projection", response_model=Projection)
def get_projection(
    user_id: UUID,
    sessions_per_week: int = Query(3, ge=1, le=7),
    weeks: int = Query(4, ge=1, le=12),
    session: Session = Depends(get_session),
) -> Projection:
    """Where each score could be after `weeks` at `sessions_per_week`, with a widening range."""
    return project(session, _require_user(session, user_id), sessions_per_week, weeks)
