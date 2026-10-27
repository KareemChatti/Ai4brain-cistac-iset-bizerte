"""Plan, collaboration score, heatmap, goals and the coach's evidence sheet."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db import get_session
from app.evidence import evidence_for
from app.models import User
from app.schemas import CollabScore, EvidenceSheet, GoalIn, GoalOut, Heatmap, Plan
from app.scoring.adaptive import next_plan
from app.scoring.collab import collab_score
from app.scoring.goals import list_goals, set_goal
from app.scoring.heatmap import build_heatmap

router = APIRouter(prefix="/api", tags=["insights"])


def _require_user(session: Session, user_id: UUID) -> str:
    uid = str(user_id)
    if session.get(User, uid) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown user")
    return uid


@router.get("/plan/{user_id}", response_model=Plan, response_model_exclude_none=True)
def get_plan(user_id: UUID, session: Session = Depends(get_session)) -> Plan:
    """Today's plan: focus dimension, the reason, opponent level and the steps."""
    return next_plan(session, _require_user(session, user_id))


@router.get("/collab/{user_id}", response_model=CollabScore)
def get_collab(user_id: UUID, session: Session = Depends(get_session)) -> CollabScore:
    """AI Collaboration Score over the last 10 sessions."""
    return collab_score(session, _require_user(session, user_id))


@router.get("/heatmap/{user_id}", response_model=Heatmap)
def get_heatmap(user_id: UUID, session: Session = Depends(get_session)) -> Heatmap:
    """Average score per dimension and time of day (Tunisia time)."""
    return build_heatmap(session, _require_user(session, user_id))


@router.get("/goals/{user_id}", response_model=list[GoalOut])
def get_goals(user_id: UUID, session: Session = Depends(get_session)) -> list[GoalOut]:
    return list_goals(session, _require_user(session, user_id))


@router.post("/goals/{user_id}", response_model=list[GoalOut])
def post_goal(user_id: UUID, body: GoalIn, session: Session = Depends(get_session)) -> list[GoalOut]:
    """Set the goal for one dimension (replaces the previous one for that dimension)."""
    return set_goal(session, _require_user(session, user_id), body.dimension, body.target)


@router.get("/evidence/{user_id}/{round_id}", response_model=EvidenceSheet)
def get_evidence(user_id: UUID, round_id: UUID, session: Session = Depends(get_session)) -> EvidenceSheet:
    """The facts the coach may use for one round."""
    try:
        return evidence_for(session, _require_user(session, user_id), str(round_id))
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown round") from None
