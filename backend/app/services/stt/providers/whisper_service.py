import torch
from app.services.stt.base import STTService
import numpy as np
from faster_whisper import WhisperModel
import io
import soundfile as sf
import time
from typing import Optional, Dict, Any

# Load Whisper model once per process (not per connection)
_global_whisper_model = None


def _get_whisper_model(model_name: str = "tiny"):
    """Get or create global Whisper model instance with CUDA support if available"""
    global _global_whisper_model

    if _global_whisper_model is None:
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"  # better for GPU
        else:
            device = "cpu"
            compute_type = "int8"  # lighter for CPU

        print(f"Loading Whisper model: {model_name} on {device} ({compute_type})")
        _global_whisper_model = WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
        )
        print("Whisper model loaded successfully")

    return _global_whisper_model


# Manually limiting to 7 seconds of audio for transcription
# class WhisperSTTService(STTService):
#     def __init__(self, model_name="tiny"):
#         self.model_name = model_name
#         self.model = None
#         self.buffer = np.array([], dtype=np.float32)
#         self.sample_rate = 16000

#     def initialize(self):
#         self.model = _get_whisper_model(self.model_name)

#     def process_audio(self, audio_bytes: bytes):
#         # Convert PCM int16 → float32
#         pcm = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
#         self.buffer = np.concatenate([self.buffer, pcm])
#         # Only transcribe if we have enough speech (e.g. 7 sec)
#         if len(self.buffer) >= 7 * self.sample_rate:
#             # Convert PCM → in-memory WAV
#             wav_bytes = io.BytesIO()
#             sf.write(wav_bytes, self.buffer, self.sample_rate, format="WAV")
#             wav_bytes.seek(0)
#             # Transcribe WAV
#             segments, _ = self.model.transcribe(
#                 wav_bytes, language="en", without_timestamps=True
#             )
#             text = " ".join([seg.text.strip() for seg in segments]).strip()

#             # Reset buffer after transcription

#             self.buffer = np.array([], dtype=np.float32)

#             return {"type": "stt_result", "text": text}

#         return None


# New implementation with dynamic speech endpoint detection using energy-based VAD
class WhisperSTTService(STTService):
    def __init__(self, model_name="tiny"):
        self.model_name = model_name
        self.model = None
        self.buffer = np.array([], dtype=np.float32)
        self.sample_rate = 16000

        # Dynamic speech detection parameters
        self.min_speech_duration = 2.0  # Minimum 2 seconds before processing
        self.silence_timeout = 1.5  # Process after 1.5 seconds of silence
        self.max_buffer_duration = 15.0  # Maximum buffer size (15 seconds)
        self.long_speech_interval = 8.0  # Process every 8 seconds for long speech

        # Simple VAD using energy/amplitude detection
        self.silence_threshold = 0.01  # Amplitude threshold for silence
        self.speech_frame_count = 0  # Count frames with speech
        self.silence_frame_count = 0  # Count consecutive silence frames
        self.frames_per_second = 50  # Assuming ~50 chunks per second

        # Tracking variables
        self.last_transcription_time = None
        self.speech_detected_in_buffer = False
        self.buffer_start_time = None

    def initialize(self):
        self.model = _get_whisper_model(self.model_name)

    def process_audio(self, audio_bytes: bytes) -> Optional[Dict[str, Any]]:
        """
        Process audio with dynamic speech endpoint detection using internal VAD
        """
        # Convert PCM int16 → float32
        pcm = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        self.buffer = np.concatenate([self.buffer, pcm])

        current_time = time.time()

        # Initialize buffer start time
        if self.buffer_start_time is None:
            self.buffer_start_time = current_time

        # Simple energy-based VAD (since we can't modify WebSocket endpoint)
        is_speech = self._detect_speech_energy(pcm)

        # Update speech/silence counters
        if is_speech:
            self.speech_frame_count += 1
            self.silence_frame_count = 0
            self.speech_detected_in_buffer = True
        else:
            self.silence_frame_count += 1

        # Calculate buffer duration
        buffer_duration = len(self.buffer) / self.sample_rate

        # Determine if we should process
        should_process = self._should_process_buffer(current_time, buffer_duration)

        if should_process and self.speech_detected_in_buffer:
            return self._transcribe_and_reset(current_time)

        # Prevent buffer from growing too large
        if buffer_duration > self.max_buffer_duration:
            print(
                f"Buffer exceeded max duration ({self.max_buffer_duration}s), forcing transcription"
            )
            return (
                self._transcribe_and_reset(current_time)
                if self.speech_detected_in_buffer
                else self._reset_buffer()
            )

        return None

    def _detect_speech_energy(self, pcm_chunk: np.ndarray) -> bool:
        """Simple energy-based voice activity detection"""
        if len(pcm_chunk) == 0:
            return False

        # Calculate RMS energy
        energy = np.sqrt(np.mean(pcm_chunk**2))

        # Consider it speech if energy is above threshold
        return energy > self.silence_threshold

    def _should_process_buffer(
        self, current_time: float, buffer_duration: float
    ) -> bool:
        """Determine if buffer should be processed based on speech patterns"""

        # Haven't detected any speech yet
        if not self.speech_detected_in_buffer:
            return False

        # Not enough speech duration yet
        if buffer_duration < self.min_speech_duration:
            return False

        # Check for silence timeout (user stopped speaking)
        silence_duration = self.silence_frame_count / self.frames_per_second
        if silence_duration >= self.silence_timeout and self.speech_frame_count > 0:
            return True

        # Long speech - process periodically to avoid huge buffers
        if self.last_transcription_time is not None:
            time_since_last = current_time - self.last_transcription_time
            if time_since_last >= self.long_speech_interval:
                return True
        elif buffer_duration >= self.long_speech_interval:
            # First long speech processing
            return True

        return False

    def _transcribe_and_reset(self, current_time: float) -> Optional[Dict[str, Any]]:
        """Transcribe current buffer and reset state"""
        try:
            # Convert PCM → in-memory WAV
            wav_bytes = io.BytesIO()
            sf.write(wav_bytes, self.buffer, self.sample_rate, format="WAV")
            wav_bytes.seek(0)

            # Transcribe WAV
            segments, _ = self.model.transcribe(
                wav_bytes, language="en", without_timestamps=True
            )

            text = " ".join([seg.text.strip() for seg in segments]).strip()

            # Update last transcription time
            self.last_transcription_time = current_time

            # Reset state but keep some speech for context in continuous speech
            buffer_duration = len(self.buffer) / self.sample_rate
            if buffer_duration > self.long_speech_interval:
                # Keep last 2 seconds for context in long continuous speech
                keep_samples = int(2.0 * self.sample_rate)
                self.buffer = (
                    self.buffer[-keep_samples:]
                    if len(self.buffer) > keep_samples
                    else np.array([], dtype=np.float32)
                )
                # Adjust counters
                self.speech_frame_count = max(
                    0,
                    self.speech_frame_count
                    - int(self.frames_per_second * (buffer_duration - 2.0)),
                )
            else:
                # Complete reset for short utterances
                self._reset_state()

            self.silence_frame_count = (
                0  # Always reset silence counter after transcription
            )

            if text:
                print(f"Transcribed after {buffer_duration:.1f}s: {text}")
                return {"type": "stt_result", "text": text}

        except Exception as e:
            print(f"Transcription error: {e}")
            self._reset_state()

        return None

    def _reset_buffer(self) -> None:
        """Reset buffer without transcription"""
        self.buffer = np.array([], dtype=np.float32)
        self._reset_state()
        return None

    def _reset_state(self) -> None:
        """Reset all tracking state"""
        self.buffer = np.array([], dtype=np.float32)
        self.speech_frame_count = 0
        self.silence_frame_count = 0
        self.speech_detected_in_buffer = False
        self.buffer_start_time = None
        # Keep last_transcription_time for continuous speech detection
