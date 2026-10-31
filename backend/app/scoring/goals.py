from sqlmodel import Session, select

from app.models import Goal
from app.schemas import GoalOut
from app.scoring.profile import build_profile
from app.timeutil import iso


def progress(current: float, baseline: float, target: float) -> float:
    if target <= baseline:
        return 1.0 if current >= target else 0.0
    return round(min(max((current - baseline) / (target - baseline), 0.0), 1.0), 3)


def list_goals(session: Session, user_id: str) -> list[GoalOut]:
    goals = session.exec(select(Goal).where(Goal.user_id == user_id).order_by(Goal.created_at)).all()
    if not goals:
        return []
    dims = build_profile(session, user_id).dimensions
    return [
        GoalOut(
            dimension=g.dimension, target=g.target, created_at=iso(g.created_at),
            progress=progress(dims[g.dimension].score, g.baseline if g.baseline is not None else 0.0, g.target),
        )
        for g in goals
    ]


def set_goal(session: Session, user_id: str, dimension: str, target: float) -> list[GoalOut]:
    for old in session.exec(select(Goal).where(Goal.user_id == user_id, Goal.dimension == dimension)):
        session.delete(old)
    baseline = build_profile(session, user_id).dimensions[dimension].score
    session.add(Goal(user_id=user_id, dimension=dimension, target=target, baseline=baseline))
    session.commit()
    return list_goals(session, user_id)
