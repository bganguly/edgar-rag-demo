from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str
    anthropic_api_key: str = ""
    nvidia_api_key: str = ""
    google_api_key: str = ""

    database_url: str = "postgresql://postgres:postgres@localhost:5433/ragdb"
    pgvector_connection: str = "postgresql+psycopg://postgres:postgres@localhost:5433/ragdb"

    edgar_user_agent: str = "edgar-rag-demo research@example.com"

    model_config = {"env_file": ".env"}


settings = Settings()
