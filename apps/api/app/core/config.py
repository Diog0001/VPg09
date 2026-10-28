from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = API_DIR.parent.parent


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://vyaz:vyaz@127.0.0.1:55432/vyaz"
    secret_key: str = "dev-secret-change-please-use-32b+"
    cookie_name: str = "vyaz_token"
    cookie_secure: bool = False
    access_token_expire_minutes: int = 60 * 24 * 7
    seed_on_start: bool = True

    model_config = SettingsConfigDict(
        env_file=(str(REPO_DIR / ".env"), str(API_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
