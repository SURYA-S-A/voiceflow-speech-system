from abc import ABC, abstractmethod
from typing import Any


class TTSService(ABC):
    """Abstract base class for TTS services"""

    @abstractmethod
    def initialize(self) -> None:
        """Initialize the TTS service if needed"""
        pass

    @abstractmethod
    def synthesize(self, text: str) -> Any:
        """Convert text into audio bytes"""
        pass
