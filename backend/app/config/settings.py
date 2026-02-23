from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # STT
    STT_ENGINE: str
    STT_MODEL_PATH: str | None = None
    STT_API_KEY: str | None = None
    STT_API_URL: str | None = None

    # TTS
    TTS_ENGINE: str
    TTS_MODEL_PATH: str | None = None
    TTS_API_KEY: str | None = None
    TTS_API_URL: str | None = None

    # VAD
    VAD_ENGINE: str
    VAD_MODEL_PATH: str | None = None

    model_config = SettingsConfigDict(env_file="../../.env", env_prefix="SPEECH_")


settings = Settings()
