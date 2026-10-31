from typing import Any, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.privacy import check_nickname

DimensionKey = Literal["memory", "attention", "speed", "reasoning", "flexibility"]
DIMENSIONS: tuple[DimensionKey, ...] = ("memory", "attention", "speed", "reasoning", "flexibility")
CollabComponent = Literal["clarification", "verification", "iteration", "autonomy", "responsible_use"]

MAX_EVENTS_PER_BATCH = 500


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EventIn(Strict):
    event_id: UUID
    user_id: UUID
    session_id: UUID
    round_id: UUID | None
    ts: AwareDatetime
    source: Literal["rami", "minigame", "coach", "app"]
    type: str = Field(min_length=1, max_length=40)
    payload: dict[str, Any]


class EventBatch(Strict):
    events: list[EventIn] = Field(max_length=MAX_EVENTS_PER_BATCH)


class EventsAccepted(BaseModel):
    accepted: int


class UserCreate(Strict):
    nickname: str = Field(min_length=1, max_length=32)

    @field_validator("nickname")
    @classmethod
    def _nickname_only(cls, value: str) -> str:
        return check_nickname(value)


class UserCreated(BaseModel):
    user_id: str


class ConsentIn(Strict):
    user_id: UUID
    consent_version: str = Field(min_length=1, max_length=16)
    analytics: bool


class Ok(BaseModel):
    ok: bool = True


class Deleted(BaseModel):
    deleted: bool = True


class DimensionEstimate(BaseModel):
    score: float
    low: float
    high: float
    n_obs: int
    trend: float


class ProfileFlags(BaseModel):
    suggest_break: bool


class Profile(BaseModel):
    user_id: str
    updated_at: str
    dimensions: dict[DimensionKey, DimensionEstimate]
    n_rounds: int
    n_minigames: int
    flags: ProfileFlags


class SnapshotOut(BaseModel):
    ts: str
    trigger: Literal["round", "minigame"]
    dimensions: dict[DimensionKey, DimensionEstimate]


class ProjectionPoint(BaseModel):
    week: int
    dimension: DimensionKey
    score: float
    low: float
    high: float


class Projection(BaseModel):
    sessions_per_week: int
    weeks: int
    points: list[ProjectionPoint]
    disclaimer: str


class PlanStep(BaseModel):
    kind: Literal["minigame", "rami"]
    game: str | None = None
    level: int | None = None


class Plan(BaseModel):
    focus: DimensionKey
    reason: str
    opponent_level: int
    quick_mode: bool
    steps: list[PlanStep]


class CollabComponentScore(BaseModel):
    score: float | None
    n: int


class CollabScore(BaseModel):
    total: float | None
    components: dict[CollabComponent, CollabComponentScore]
    weights: dict[CollabComponent, float]


class Heatmap(BaseModel):
    rows: list[DimensionKey]
    cols: list[str]
    cells: list[list[float | None]]


class GoalIn(Strict):
    dimension: DimensionKey
    target: float = Field(ge=0, le=100)


class GoalOut(BaseModel):
    dimension: DimensionKey
    target: float
    created_at: str
    progress: float


class Fact(BaseModel):
    id: str
    dimension: DimensionKey | Literal["general"]
    kind: str
    turn_no: int | None
    text: str
    value: float | None


class EvidenceSheet(BaseModel):
    round_id: str
    user_id: str
    result: Literal["win", "loss", "abandoned"]
    facts: list[Fact]
    stats: dict[str, float]
    profile_delta: dict[DimensionKey, float]


class MatchRound(BaseModel):
    round_id: str
    user_penalty: int
    ai_penalty: int
    winner: Literal["user", "ai"] | None


class MatchSummary(BaseModel):
    match_id: str
    target: int
    started_at: str
    ended_at: str | None
    winner: Literal["user", "ai"] | None
    user_total: int
    ai_total: int
    rounds: list[MatchRound]
