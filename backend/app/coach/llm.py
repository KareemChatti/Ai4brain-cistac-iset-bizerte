"""The only place that talks to the LLM provider. Swap the provider here and nothing else changes."""

import os
from typing import TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "claude-sonnet-5-5"
DEFAULT_TIMEOUT_S = 15.0


class LLMUnavailable(Exception):
    """No key, timeout, API error or refusal. Callers fall back to a template."""


_client = None


def _get_client():
    global _client
    if _client is None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise LLMUnavailable("ANTHROPIC_API_KEY is not set")
        import anthropic

        _client = anthropic.Anthropic(max_retries=0)
    return _client


def complete_json(system: str, user: str, schema_model: type[T], timeout: float = DEFAULT_TIMEOUT_S) -> T:
    """Ask the model for JSON matching `schema_model` and return it parsed.

    Structured outputs make the reply schema-valid; content rules (fact ids, wording) are checked by
    guardrails.py. Sampling parameters such as temperature are not sent: current models reject them,
    so low `effort` is what keeps answers short and fast.
    """
    if os.getenv("COACH_LLM_DISABLED") == "1":
        raise LLMUnavailable("LLM disabled by COACH_LLM_DISABLED")
    client = _get_client()
    import anthropic

    try:
        response = client.messages.parse(
            model=os.getenv("COACH_MODEL", DEFAULT_MODEL),
            max_tokens=4000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_format=schema_model,
            output_config={"effort": "low"},
            timeout=timeout,
        )
    except anthropic.APITimeoutError as e:
        raise LLMUnavailable(f"timeout after {timeout}s") from e
    except anthropic.APIConnectionError as e:
        raise LLMUnavailable("connection error") from e
    except anthropic.APIStatusError as e:
        raise LLMUnavailable(f"API error {e.status_code}") from e
    except ValueError as e:  # reply did not validate against the schema
        raise LLMUnavailable(f"invalid JSON: {e}") from e

    if response.stop_reason != "end_turn" or response.parsed_output is None:
        raise LLMUnavailable(f"no usable answer (stop_reason={response.stop_reason})")
    return response.parsed_output
