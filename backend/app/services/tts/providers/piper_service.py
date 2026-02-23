from io import BytesIO
import wave
from piper import PiperVoice
from app.config.settings import settings
from app.services.tts.base import TTSService

# Load Piper Voice model once per process
_global_piper_voice = PiperVoice.load(settings.TTS_MODEL_PATH)


class PiperTTSService(TTSService):
    """Piper TTS service implementation"""

    def __init__(self):
        self.voice = None

    def initialize(self) -> None:
        """Assign global voice (shared model)"""
        self.voice = _global_piper_voice

    def synthesize(self, text: str) -> bytes:
        """Generate WAV audio from text"""
        buffer = BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            self.voice.synthesize_wav(text, wav_file)
        buffer.seek(0)
        return buffer.getvalue()
