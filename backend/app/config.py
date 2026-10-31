import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
FIXTURES_DIR = REPO_ROOT / "shared" / "fixtures"

load_dotenv(BACKEND_DIR / ".env")

DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def _split(value: str | None) -> list[str]:
    return [part.strip().rstrip("/") for part in (value or "").split(",") if part.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: os.getenv("DATABASE_URL") or f"sqlite:///{BACKEND_DIR / 'data.db'}"
    )
    cors_origins: list[str] = field(
        default_factory=lambda: DEV_ORIGINS + _split(os.getenv("FRONTEND_URL"))
    )
    retention_days: int = field(default_factory=lambda: int(os.getenv("RETENTION_DAYS", "90")))
    inactive_days: int = field(default_factory=lambda: int(os.getenv("INACTIVE_DAYS", "180")))
    seed_demo: bool = field(default_factory=lambda: os.getenv("SEED_DEMO", "").lower() in ("1", "true", "yes"))


settings = Settings()
