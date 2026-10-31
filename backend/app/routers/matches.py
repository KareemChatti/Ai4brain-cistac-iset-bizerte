from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.db import get_session
from app.models import User
from app.schemas import MatchSummary
from app.scoring.matches import match_history

router = APIRouter(prefix="/api", tags=["matches"])


@router.get("/matches/{user_id}", response_model=list[MatchSummary])
def get_matches(
    user_id: UUID, limit: int = Query(20, ge=1, le=100), session: Session = Depends(get_session)
) -> list[MatchSummary]:
    uid = str(user_id)
    if session.get(User, uid) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown user")
    return match_history(session, uid, limit)
