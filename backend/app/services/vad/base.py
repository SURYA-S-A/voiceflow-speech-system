from abc import ABC, abstractmethod
from typing import Any


class VADService(ABC):
    """Abstract base class for VAD services"""

    @abstractmethod
    def initialize(self) -> None:
        """Initialize the VAD service"""
        pass

    @abstractmethod
    def detect(self, audio_bytes: bytes) -> Any:
        """Run VAD detection"""
        pass
