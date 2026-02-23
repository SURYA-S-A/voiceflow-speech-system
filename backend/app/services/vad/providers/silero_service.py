import numpy as np
import torch
from app.services.vad.base import VADService
from silero_vad import load_silero_vad, get_speech_timestamps

# Load Silero VAD model once per process
# _vad_model, _utils = torch.hub.load(
#     repo_or_dir="snakers4/silero-vad",
#     model="silero_vad",
#     force_reload=False,
# )
# _get_speech_timestamps, _, _, _, _ = _utils

_vad_model = load_silero_vad()
_get_speech_timestamps = get_speech_timestamps


class SileroVADService(VADService):
    """Silero VAD service implementation"""

    def __init__(self):
        self.model = None

    def initialize(self) -> None:
        """Assign global VAD model"""
        self.model = _vad_model

    def detect(self, audio_bytes: bytes) -> bool:
        """Detect if speech is present in the audio chunk"""
        # Convert bytes to int16 numpy array
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)

        # Normalize int16 to float32 in range [-1, 1]
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        # Convert to PyTorch tensor
        audio_tensor = torch.from_numpy(audio_float32)

        # Ensure tensor is 1D
        if len(audio_tensor.shape) > 1:
            audio_tensor = audio_tensor.squeeze()

        # Skip if audio chunk is too short
        if len(audio_tensor) < 512:  # Minimum chunk size
            return False

        # Run VAD - adjust parameters for better sensitivity
        speech_timestamps = _get_speech_timestamps(
            audio_tensor,
            self.model,
            sampling_rate=16000,
            threshold=0.3,  # Lower threshold for more sensitivity
            min_speech_duration_ms=100,  # Shorter minimum speech duration
            min_silence_duration_ms=50,  # Shorter minimum silence duration
        )

        has_speech = len(speech_timestamps) > 0

        # Only log when speech is detected to reduce noise
        if has_speech:
            print(f"🔊 VAD: {len(speech_timestamps)} speech segments found")

        return has_speech
