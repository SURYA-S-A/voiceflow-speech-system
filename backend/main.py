from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.stt_ws import router as stt_ws_router
from app.api.tts_http import router as tts_http_router
from app.api.unified_ws import router as unified_ws_router
from app.api.vad_ws import router as vad_ws_router


app = FastAPI(
    title="VoiceFlow Speech API",
    description="""
    A unified API for Speech-to-Text (STT), Text-to-Speech (TTS), and Voice Activity Detection (VAD).
    Provides WebSocket and HTTP endpoints for real-time and batch audio processing.
    """,
    version="1.0.0",
    root_path="/api",
    docs_url="/swagger",
    openapi_url="/docs/openapi.json",
    redoc_url="/docs",
)

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(stt_ws_router)
app.include_router(tts_http_router)
app.include_router(unified_ws_router)
app.include_router(vad_ws_router)
