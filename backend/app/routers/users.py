import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.db import get_session
from app.models import User
from app.schemas import ConsentIn, Ok, UserCreate, UserCreated
from app.timeutil import utcnow

router = APIRouter(prefix="/api", tags=["users"])


@router.post("/users", response_model=UserCreated, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, session: Session = Depends(get_session)) -> UserCreated:
    user = User(user_id=str(uuid.uuid4()), nickname=body.nickname)
    session.add(user)
    session.commit()
    return UserCreated(user_id=user.user_id)


@router.post("/consent", response_model=Ok)
def give_consent(body: ConsentIn, session: Session = Depends(get_session)) -> Ok:
    user = session.get(User, str(body.user_id))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown user")
    user.consent_version = body.consent_version
    user.consent_at = utcnow()
    user.analytics = body.analytics
    session.add(user)
    session.commit()
    return Ok()
