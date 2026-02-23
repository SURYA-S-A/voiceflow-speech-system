# VoiceFlow Speech System

A real-time speech processing system with **STT** (Speech-to-Text), **TTS** (Text-to-Speech), and **VAD** (Voice Activity Detection) over a unified WebSocket pipeline.

- **STT** using [Vosk] / [Whisper]
- **TTS** using [Piper]
- **VAD** using [Silero VAD]
- **Unified WebSocket API** for real-time audio streaming (STT + TTS + VAD combined)

---

## Architecture

```
Frontend (AudioWorkletProcessor)
  └── captures audio → Float32 PCM frames → streams over WebSocket

Backend (Unified WS)
  └── VAD detects speech → STT transcribes → TTS synthesizes → streams back
```

Each service (STT, TTS, VAD) is a **provider class** with a common base interface. A dispatcher initializes the correct engine from `.env` — swapping engines requires no code changes.

---

## Getting Started

### Prerequisites — Download Models

The app requires local models. Download and place them anywhere on your machine, then point to them in `.env`.

| Component | Engine | Model |
|-----------|--------|-------|
| STT | Vosk | [vosk-model-en-us-0.42-gigaspeech](https://alphacephei.com/vosk/models) — download & extract |
| TTS | Piper | [en_US-amy-low.onnx](https://github.com/rhasspy/piper/releases) — download `.onnx` + `.onnx.json` |
| VAD | Silero | Auto-downloaded on first run |

> Piper requires both `en_US-amy-low.onnx` and `en_US-amy-low.onnx.json` in the same folder.

---

### Backend

The backend uses **Poetry** for dependency management.

```bash
cd backend
poetry install
```

Copy and configure the env file:

```bash
cp .env.example .env
```

```dotenv
# STT
SPEECH_STT_ENGINE=vosk
SPEECH_STT_MODEL_PATH=C://models//vosk//vosk-model-en-us-0.42-gigaspeech

# TTS
SPEECH_TTS_ENGINE=piper
SPEECH_TTS_MODEL_PATH=C://models//piper//en_US-amy-low.onnx

# VAD
SPEECH_VAD_ENGINE=silero
SPEECH_VAD_MODEL_PATH=
```

Run the backend — **F5** in VS Code, or:

```bash
poetry run uvicorn main:app --reload --host 0.0.0.0 --port 9090
```

Backend runs at `http://localhost:9090`

---

### Frontend

The frontend uses **npm**.

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`

---

## Test Pages

| URL | Description |
|-----|-------------|
| `http://localhost:3000/nextapp/vad` | Test VAD — background noise detection |
| `http://localhost:3000/nextapp/unified` | Combined live STT + TTS stream |
| `http://localhost:3000/nextapp/voice` | Manual button capture — STT + playback |
| `http://localhost:3000/nextapp/bot/voice` | Full chat interface — VAD + STT + TTS |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python), Poetry |
| STT | Vosk / Whisper |
| TTS | Piper |
| VAD | Silero |
| Transport | WebSocket |
| Frontend | Next.js (TypeScript), npm |