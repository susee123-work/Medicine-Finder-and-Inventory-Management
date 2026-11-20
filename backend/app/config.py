import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Load backend/.env reliably regardless of current working directory (root or backend/)
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")
load_dotenv()


class Settings:
    PROJECT_NAME: str = "MediPulse AI"
    VERSION: str = "2.0.0"
    API_PREFIX: str = "/api/v1"

    # Environment
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")

    # Supabase credentials (optional for local/test mode)
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    USE_LOCAL_DB: bool = (not SUPABASE_URL) or os.getenv("USE_LOCAL_DB", "false").lower() in ("true", "1")

    # Security & JWT
    JWT_SECRET: str = os.getenv("JWT_SECRET", "medipulse-ai-dev-secret-key-change-in-prod-2026")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # CORS
    ALLOWED_ORIGINS: List[str] = [
        origin.strip()
        for origin in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
        ).split(",")
        if origin.strip()
    ]

    # Rate Limiting
    RATE_LIMIT_PUBLIC: str = os.getenv("RATE_LIMIT_PUBLIC", "60/minute")

    # Notification providers
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER: str = os.getenv("TWILIO_PHONE_NUMBER", "")
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    MOCK_NOTIFICATIONS: bool = os.getenv("MOCK_NOTIFICATIONS", "false").lower() in ("true", "1")

    # SMTP Email (Gmail) & HTTPS Email Fallback (for networks blocking ports 587/465)
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "").strip()
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "").replace(" ", "").strip()
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "MediPulse AI")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1")
    EMAIL_WEBHOOK_URL: str = os.getenv("EMAIL_WEBHOOK_URL", "").strip()

    # ML & Forecasting Defaults
    DEFAULT_FORECAST_HORIZON_DAYS: int = 7
    DEFAULT_SERVICE_LEVEL_Z: float = 1.65  # 95% cycle service level
    DEFAULT_LEAD_TIME_DAYS: int = 3


settings = Settings()
