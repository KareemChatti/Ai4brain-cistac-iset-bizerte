from typing import Literal, Optional

from pydantic import BaseModel, Field

DimensionKey = Literal["memory", "attention", "speed", "reasoning", "flexibility"]


class KeyMoment(BaseModel):
    turn_no: int
    title: str
    explanation: str
    tip: str
    fact_ids: list[str]


class Strength(BaseModel):
    text: str
    fact_ids: list[str]


class NextFocus(BaseModel):
    dimension: DimensionKey
    text: str
    fact_ids: list[str]


class Review(BaseModel):
    round_id: str
    headline: str
    key_moments: list[KeyMoment]
    strengths: list[Strength]
    next_focus: NextFocus
    voice_text: str
    source: Literal["llm", "template"] = "llm"


class Hint(BaseModel):
    hint_id: str
    action: Literal["draw_stock", "draw_discard", "discard", "lay_down"]
    card: Optional[str] = None
    confidence: float = Field(ge=0, le=1)
    reason_codes: list[str] = []


class ReviewRequest(BaseModel):
    user_id: str
    round_id: str


class ExplainHintRequest(BaseModel):
    user_id: str
    hint: Hint
    state_summary: dict = {}
    language: str = "en"


class ExplainHintResponse(BaseModel):
    text: str


class ChatRequest(BaseModel):
    user_id: str
    message: str = Field(max_length=2000)
    language: str = "en"


class ChatResponse(BaseModel):
    reply: str
    fact_ids: list[str] = []
    contains_personal_data: bool = False


class HintText(BaseModel):
    text: str


class ChatAnswer(BaseModel):
    reply: str
    fact_ids: list[str]


class ReviewDraft(BaseModel):

    headline: str
    key_moments: list[KeyMoment]
    strengths: list[Strength]
    next_focus: NextFocus
    voice_text: str
