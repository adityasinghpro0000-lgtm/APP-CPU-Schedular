"""
Configuration settings for CPU Scheduling Simulator Backend.
Uses environment variables for sensitive data.
"""

import os
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings


# Ignore non-boolean DEBUG values injected by some shells/launch environments.
if os.getenv("DEBUG", "false").strip().lower() not in {"true", "false", "1", "0", "yes", "no", "on", "off"}:
    os.environ.pop("DEBUG", None)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # App settings
    APP_NAME: str = "CPU Scheduling Simulator API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # Database settings
    DATABASE_URL: str = Field(
        default="mysql+pymysql://root@localhost/cpu_scheduling",
        description="Database URL, configurable with DATABASE_URL"
    )
    
    # JWT settings
    SECRET_KEY: str = Field(
        default=os.getenv("SECRET_KEY", "your-secret-key-change-in-production"),
        description="Secret key for JWT token signing"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Password reset email delivery. Configure these to enable account recovery.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_USE_TLS: bool = True
    APP_PUBLIC_URL: str = "http://127.0.0.1:8000"
    
    # CORS settings
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:8000", "http://127.0.0.1:8000"],
        description="Allowed CORS origins"
    )
    
    # Rate limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    
    class Config:
        env_file = str(Path(__file__).resolve().parent / ".env")
        case_sensitive = True


# Paths
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "Frontend"
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

settings = Settings()
