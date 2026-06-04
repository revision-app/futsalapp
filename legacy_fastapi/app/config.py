from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/futsalapp"
    SECRET_KEY: str = "change-this-to-a-random-secret-key"
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "noreply@example.com"
    ADMIN_INVITE_SECRET: str = "change-this-to-another-random-secret"
    BASE_URL: str = "http://localhost:8000"


settings = Settings()
