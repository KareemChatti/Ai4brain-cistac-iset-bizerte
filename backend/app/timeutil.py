from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


def to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return to_utc(value).isoformat(timespec="seconds").replace("+00:00", "Z")
