from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/marketplace"
    REDIS_URL: str = "redis://localhost:6379/0"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "marketplace"
    CREDIT_SERVICE_URL: str = "http://localhost:8080"
    INTERNAL_ADMIN_TOKEN: str = ""
    CORS_ORIGINS: List[str] = ["*"]
    PLATFORM_FEE_RATE: float = 0.10
    PLATFORM_TREASURY_AID: str = "agent://a2ahub/platform-treasury"

    class Config:
        env_file = ".env"

settings = Settings()
