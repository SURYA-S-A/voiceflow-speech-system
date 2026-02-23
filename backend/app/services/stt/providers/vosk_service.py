from typing import Any
from app.services.stt.base import STTService
import json
import numpy as np
from vosk import Model, KaldiRecognizer
from app.config.settings import settings

# Load Vosk model once per process (not per connection)
_global_vosk_model = Model(settings.STT_MODEL_PATH)


class VoskSTTService(STTService):
    """Vosk STT service implementation"""

    def __init__(self):
        self.recognizer = None

    def initialize(self) -> None:
        """Initialize Vosk model and recognizer"""
        self.recognizer = KaldiRecognizer(_global_vosk_model, 16000)
        self.recognizer.SetWords(True)

    def process_audio(self, audio_bytes: bytes) -> Any:
        """Process audio with Vosk"""
        pcm = np.frombuffer(audio_bytes, dtype=np.int16)
        if self.recognizer.AcceptWaveform(pcm.tobytes()):
            result = json.loads(self.recognizer.Result())
            return {
                "type": "stt_result",
                "text": result.get("text", ""),
                "confidence": result.get("conf", 0),
            }
