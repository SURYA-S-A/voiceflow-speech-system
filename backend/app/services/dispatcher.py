from app.config.constants import STTEngines, TTSEngines, VADEngines
from app.config.settings import settings
from app.services.stt.providers.vosk_service import VoskSTTService
from app.services.stt.providers.whisper_service import WhisperSTTService
from app.services.tts.providers.piper_service import PiperTTSService
from app.services.vad.providers.silero_service import SileroVADService


def create_stt_service():
    """
    Factory function to create a Speech-to-Text (STT) service instance
    based on the configured engine in settings.
    """
    match settings.STT_ENGINE.lower():
        case STTEngines.VOSK:
            service = VoskSTTService()
        case STTEngines.WHISPER:
            service = WhisperSTTService()
        case _:
            raise ValueError(f"Unsupported STT engine: {settings.STT_ENGINE}")

    service.initialize()
    return service


def create_tts_service():
    """
    Factory function to create a Text-to-Speech (TTS) service instance
    based on the configured engine in settings.
    """
    match settings.TTS_ENGINE.lower():
        case TTSEngines.PIPER:
            service = PiperTTSService()
        case _:
            raise ValueError(f"Unsupported TTS engine: {settings.TTS_ENGINE}")

    service.initialize()
    return service


def create_vad_service():
    """
    Factory function to create a Voice Activity Detection (VAD) service instance
    based on the configured engine in settings.
    """
    match settings.VAD_ENGINE.lower():
        case VADEngines.SILERO:
            service = SileroVADService()
        case _:
            raise ValueError(f"Unsupported VAD engine: {settings.VAD_ENGINE}")

    service.initialize()
    return service
