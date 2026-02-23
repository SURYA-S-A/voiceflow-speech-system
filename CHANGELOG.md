# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-02-23

### Added
- Next.js frontend with real-time voice chat interface
- VAD test page (`/nextapp/vad`) for background noise detection
- Unified STT + TTS live stream page (`/nextapp/unified`)
- Manual button capture page (`/nextapp/voice`) for STT and playback
- Full chat interface (`/nextapp/bot/voice`) combining VAD, STT, and TTS

### Changed
- Project structure with `backend/` and `frontend/` folders
- Renamed project to `voiceflow-speech-system`

---

## [0.1.0] - 2026-02-08

### Added
- FastAPI Python-based speech services backend
- Speech-to-Text (STT) support using Vosk and Whisper
- Text-to-Speech (TTS) support using Piper
- Voice Activity Detection (VAD) using Silero
- Unified WebSocket API for real-time audio streaming
- HTTP API for text-to-speech conversion
- Modular provider-based architecture
- Environment-based service configuration
- Efficient model loading and reuse