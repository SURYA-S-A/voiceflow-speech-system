from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse, JSONResponse
from io import BytesIO
from app.services.dispatcher import create_tts_service

router = APIRouter()


@router.post("/tts")
async def tts_http(request: Request):
    # Each connection gets a new instance
    tts_service = create_tts_service()
    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        return JSONResponse(content={"error": "No text provided"}, status_code=400)

    audio_bytes = tts_service.synthesize(text)
    return StreamingResponse(BytesIO(audio_bytes), media_type="audio/wav")
