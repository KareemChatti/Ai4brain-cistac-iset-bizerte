"""The only place that talks to the LLM provider. Swap the provider here and nothing else changes.

Two providers:
- "ollama" (default without an API key): a local model served by Ollama (https://ollama.com),
  no key and no account. Ollama's structured outputs constrain the reply to the JSON schema.
- "anthropic": Claude through the Anthropic SDK, when ANTHROPIC_API_KEY is set.

Settings (backend/.env): COACH_PROVIDER, OLLAMA_URL, OLLAMA_MODEL, COACH_MODEL (Claude model),
COACH_TIMEOUT_S. Whatever the provider, guardrails.py then checks the content (fact ids, wording),
and the router falls back to a template review if the model is unavailable.
"""

import json
import os
import socket
import time
import urllib.error
import urllib.request
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "claude-sonnet-5-5"
DEFAULT_OLLAMA_MODEL = "qwen2.5:3b"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"


class LLMUnavailable(Exception):
    """No key, model not running, timeout, API error or refusal. Callers fall back to a template."""


def provider() -> str:
    explicit = os.getenv("COACH_PROVIDER", "").strip().lower()
    if explicit in ("ollama", "anthropic"):
        return explicit
    return "anthropic" if os.getenv("ANTHROPIC_API_KEY") else "ollama"


def model_name() -> str:
    if provider() == "ollama":
        return os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL)
    return os.getenv("COACH_MODEL", DEFAULT_MODEL)


def _ollama_url() -> str:
    return os.getenv("OLLAMA_URL", DEFAULT_OLLAMA_URL).rstrip("/")


# A local model needs time to load into memory on the first request; a hosted API does not.
DEFAULT_TIMEOUT_S = float(os.getenv("COACH_TIMEOUT_S") or (60.0 if provider() == "ollama" else 15.0))


def complete_json(system: str, user: str, schema_model: type[T], timeout: float = DEFAULT_TIMEOUT_S) -> T:
    """Ask the model for JSON matching `schema_model` and return it parsed."""
    if os.getenv("COACH_LLM_DISABLED") == "1":
        raise LLMUnavailable("LLM disabled by COACH_LLM_DISABLED")
    if provider() == "ollama":
        return _ollama_json(system, user, schema_model, timeout)
    return _anthropic_json(system, user, schema_model, timeout)


# ---------------------------------------------------------------- Ollama (local)
def inline_schema(schema_model: type[BaseModel]) -> dict[str, Any]:
    """The model's JSON schema with every $ref expanded, which local models follow more reliably."""
    schema = schema_model.model_json_schema()
    defs = schema.pop("$defs", {})

    def expand(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                return expand(defs[node["$ref"].split("/")[-1]])
            return {k: expand(v) for k, v in node.items() if k != "title"}
        if isinstance(node, list):
            return [expand(x) for x in node]
        return node

    return expand(schema)


def _post(path: str, body: dict | None, timeout: float) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"{_ollama_url()}{path}", data=data, headers={"Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (local Ollama URL)
        return json.loads(response.read().decode())


# When Ollama is not running, refusing a connection costs ~2 s on Windows: remember it briefly.
DOWN_FOR_S = 30.0
_down_until = 0.0


def _ollama_json(system: str, user: str, schema_model: type[T], timeout: float) -> T:
    global _down_until
    if time.monotonic() < _down_until:
        raise LLMUnavailable(f"Ollama is not running at {_ollama_url()} (checked recently)")
    model = model_name()
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "format": inline_schema(schema_model),
        "stream": False,
        "options": {"temperature": 0.2},
        "keep_alive": "15m",
    }
    try:
        reply = _post("/api/chat", body, timeout)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise LLMUnavailable(f"model {model} is not installed; run: ollama pull {model}") from e
        raise LLMUnavailable(f"Ollama error {e.code}") from e
    except (TimeoutError, socket.timeout) as e:
        raise LLMUnavailable(f"timeout after {timeout:.0f}s") from e
    except urllib.error.URLError as e:
        if isinstance(e.reason, (TimeoutError, socket.timeout)):
            raise LLMUnavailable(f"timeout after {timeout:.0f}s") from e
        _down_until = time.monotonic() + DOWN_FOR_S
        raise LLMUnavailable(f"Ollama is not running at {_ollama_url()}") from e

    _down_until = 0.0
    content = (reply.get("message") or {}).get("content", "")
    try:
        return schema_model.model_validate_json(content)
    except ValidationError as e:
        raise LLMUnavailable(f"invalid JSON: {e.error_count()} problem(s)") from e


# ---------------------------------------------------------------- Anthropic (hosted)
_client = None


def _get_client():
    global _client
    if _client is None:
        if not os.getenv("ANTHROPIC_API_KEY"):
            raise LLMUnavailable("ANTHROPIC_API_KEY is not set")
        import anthropic

        _client = anthropic.Anthropic(max_retries=0)
    return _client


def _anthropic_json(system: str, user: str, schema_model: type[T], timeout: float) -> T:
    """Structured outputs make the reply schema-valid. Sampling parameters such as temperature are
    not sent: current models reject them, so low `effort` keeps answers short and fast."""
    client = _get_client()
    import anthropic

    try:
        response = client.messages.parse(
            model=model_name(),
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


# ---------------------------------------------------------------- status (for /api/health)
def status() -> dict[str, Any]:
    """Which model the coach uses and whether it can answer right now (cheap check)."""
    info: dict[str, Any] = {"provider": provider(), "model": model_name(), "ready": False}
    if os.getenv("COACH_LLM_DISABLED") == "1":
        info["detail"] = "disabled"
    elif provider() == "anthropic":
        info["ready"] = bool(os.getenv("ANTHROPIC_API_KEY"))
        info["detail"] = "key set" if info["ready"] else "ANTHROPIC_API_KEY is not set"
    else:
        try:
            tags = _post("/api/tags", None, timeout=2)
            installed = {m.get("name") for m in tags.get("models", [])}
            wanted = model_name()
            info["ready"] = wanted in installed or f"{wanted}:latest" in installed
            info["detail"] = "model installed" if info["ready"] else f"run: ollama pull {wanted}"
        except Exception:  # noqa: BLE001
            info["detail"] = f"Ollama is not running at {_ollama_url()}"
    return info
