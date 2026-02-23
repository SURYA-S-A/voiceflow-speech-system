from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect
from app.services.dispatcher import create_stt_service

router = APIRouter()


@router.websocket("/ws/stt")
async def stt_ws(websocket: WebSocket):
    await websocket.accept()
    # Each connection gets a new instance
    stt_service = create_stt_service()

    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            result = stt_service.process_audio(audio_bytes)

            if result and result.get("text", "").strip():
                text = result["text"]
                print(f"Recognized: {text}")
                await websocket.send_text(text)
    except WebSocketDisconnect:
        print("STT WebSocket disconnected")
