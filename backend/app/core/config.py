from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MedStream API"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    database_url: str

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_vitals_topic: str = "vitals-events"
    kafka_alerts_topic: str = "alerts-events"
    batch_interval_seconds: int = 30
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    frontend_base_url: str = "http://localhost:5173"

    heart_rate_alert_threshold: int = 120
    oxygen_alert_threshold: int = 92
    temperature_alert_threshold: int = 39

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
