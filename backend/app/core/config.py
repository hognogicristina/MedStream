from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MedStream API"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    database_url: str

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_vitals_topic: str = "vitals-events"

    heart_rate_alert_threshold: int = 120
    oxygen_alert_threshold: int = 92
    temperature_alert_threshold: int = 39

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()