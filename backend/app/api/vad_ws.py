import base64
import json
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect
from app.services.dispatcher import create_vad_service

router = APIRouter()


@router.websocket("/ws/vad")
async def vad_ws(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected")

    # Create VAD service once per WebSocket connection
    vad_service = create_vad_service()

    # Each connection gets its own state
    audio_buffer = bytearray()
    silence_counter = 0
    silence_threshold = 20

    try:
        while True:

            # Receive JSON message instead of bytes
            message = await websocket.receive()
            print(f"Received message: {message['type']}")

            if message["type"] == "websocket.disconnect":
                print("🔌 Client disconnected")
                break

            if message.get("bytes"):
                audio_bytes = message["bytes"]

                # Process the audio chunk
                has_speech = vad_service.detect(audio_bytes)

                if has_speech:
                    print("Speech detected!")
                    audio_buffer.extend(audio_bytes)
                    silence_counter = 0
                    # Send immediate feedback
                    await websocket.send_text(
                        '{"status": "speech", "message": "Speech detected"}'
                    )
                else:
                    print("No speech detected")
                    silence_counter += 1
                    await websocket.send_text(
                        '{"status": "silence", "message": "No speech"}'
                    )

                    if silence_counter > silence_threshold and len(audio_buffer) > 0:
                        print("Speech segment finished, processing...")
                        await websocket.send_text(
                            '{"status": "segment_complete", "message": "Speech segment completed"}'
                        )
                        audio_buffer.clear()
                        silence_counter = 0

            elif message.get("text"):
                data = json.loads(message["text"])

                if data["type"] == "audio":

                    audio_bytes = base64.b64decode(data["data"])
                    # print(f"Received audio chunk: {len(audio_bytes)} bytes")

                    # Process the audio chunk
                    has_speech = vad_service.detect(audio_bytes)

                    if has_speech:
                        print("🔊 Speech detected!")
                        audio_buffer.extend(audio_bytes)
                        silence_counter = 0
                        # Send immediate feedback
                        await websocket.send_text(
                            '{"status": "speech", "message": "Speech detected"}'
                        )
                    else:
                        print("🔇 No speech detected")
                        silence_counter += 1
                        await websocket.send_text(
                            '{"status": "silence", "message": "No speech"}'
                        )

                        if (
                            silence_counter > silence_threshold
                            and len(audio_buffer) > 0
                        ):
                            print("Speech segment finished, processing...")
                            await websocket.send_text(
                                '{"status": "segment_complete", "message": "Speech segment completed"}'
                            )
                            audio_buffer.clear()
                            silence_counter = 0

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
