from abc import ABC, abstractmethod
from typing import Any


class STTService(ABC):
    """Abstract base class for STT services"""

    @abstractmethod
    def initialize(self) -> None:
        """Initialize the STT service if needed"""
        pass

    @abstractmethod
    def process_audio(self, audio_bytes: bytes) -> Any:
        """Process audio and return transcription result"""
        pass
