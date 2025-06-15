"""
Application configuration
"""

import secrets
from typing import Any, Dict, List, Optional, Union
from pydantic import AnyHttpUrl, BaseSettings, EmailStr, HttpUrl, PostgresDsn, validator


class Settings(BaseSettings):
    """Application settings"""
    
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "AdMetrics"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "AI-Powered Advertising Analytics Platform"
    
    # Security
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48
    
    # CORS
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []
    
    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)
    
    # Database
    POSTGRES_SERVER: str
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    DATABASE_URI: Optional[PostgresDsn] = None
    
    @validator("DATABASE_URI", pre=True)
    def assemble_db_connection(cls, v: Optional[str], values: Dict[str, Any]) -> Any:
        if isinstance(v, str):
            return v
        return PostgresDsn.build(
            scheme="postgresql",
            user=values.get("POSTGRES_USER"),
            password=values.get("POSTGRES_PASSWORD"),
            host=values.get("POSTGRES_SERVER"),
            path=f"/{values.get('POSTGRES_DB') or ''}",
        )
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_PASSWORD: Optional[str] = None
    
    # Email
    SMTP_TLS: bool = True
    SMTP_PORT: Optional[int] = None
    SMTP_HOST: Optional[str] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAILS_FROM_EMAIL: Optional[EmailStr] = None
    EMAILS_FROM_NAME: Optional[str] = None
    SENDER_EMAIL: Optional[str] = None
    
    @validator("EMAILS_FROM_NAME")
    def get_project_name(cls, v: Optional[str], values: Dict[str, Any]) -> str:
        if not v:
            return values["PROJECT_NAME"]
        return v
    
    @validator("SENDER_EMAIL", pre=True)
    def get_sender_email(cls, v: Optional[str], values: Dict[str, Any]) -> str:
        if not v:
            return values.get("EMAILS_FROM_EMAIL", "noreply@admetrics.com")
        return v
    
    # AWS
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    REPORT_STORAGE_BUCKET: str = "admetrics-reports"
    
    # AI Engine
    AI_ENGINE_URL: str = "http://localhost:8001"
    AI_ENGINE_API_KEY: Optional[str] = None
    
    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"
    
    # Superuser
    FIRST_SUPERUSER: EmailStr
    FIRST_SUPERUSER_PASSWORD: str
    
    # OAuth Providers
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    FACEBOOK_APP_ID: Optional[str] = None
    FACEBOOK_APP_SECRET: Optional[str] = None
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_PERIOD: int = 60  # seconds
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    
    # Monitoring
    SENTRY_DSN: Optional[HttpUrl] = None
    ENVIRONMENT: str = "development"
    
    # Webhooks
    WEBHOOK_URLS: Dict[str, str] = {}
    WEBHOOK_TIMEOUT: int = 10  # seconds
    
    # Cache
    CACHE_TTL: int = 300  # 5 minutes
    CACHE_KEY_PREFIX: str = "admetrics"
    
    # Background Tasks
    CELERY_BROKER_URL: Optional[str] = None
    CELERY_RESULT_BACKEND: Optional[str] = None
    
    @validator("CELERY_BROKER_URL", pre=True)
    def get_celery_broker(cls, v: Optional[str], values: Dict[str, Any]) -> str:
        if not v:
            return values.get("REDIS_URL", "redis://localhost:6379/0")
        return v
    
    @validator("CELERY_RESULT_BACKEND", pre=True)
    def get_celery_backend(cls, v: Optional[str], values: Dict[str, Any]) -> str:
        if not v:
            return values.get("REDIS_URL", "redis://localhost:6379/0")
        return v
    
    # Features
    FEATURES: Dict[str, bool] = {
        "ai_insights": True,
        "anomaly_detection": True,
        "content_generation": True,
        "audience_segmentation": True,
        "bid_optimization": True,
        "creative_optimization": True,
        "sentiment_analysis": True,
        "forecasting": True,
        "multi_platform": True,
        "custom_dashboards": True,
        "scheduled_reports": True,
        "webhook_notifications": True,
        "export_functionality": True,
        "team_collaboration": True
    }
    
    class Config:
        case_sensitive = True
        env_file = ".env"


settings = Settings()