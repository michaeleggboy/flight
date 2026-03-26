from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    amadeus_api_key: str = ""
    amadeus_api_secret: str = ""
    use_mock_data: bool = True
    cors_origins: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
