import json
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect
from app.services.dispatcher import (
    create_stt_service,
    create_tts_service,
    create_vad_service,
)

router = APIRouter()


@router.websocket("/ws/unified")
async def unified_ws(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connected")

    # Each connection gets a new instance
    stt_service = create_stt_service()
    tts_service = create_tts_service()
    vad_service = create_vad_service()

    # Track TTS state // Newly added
    is_tts_playing = False

    # VAD tracking variables for conversation flow
    silence_counter = 0
    silence_threshold = 5  # Adjust based on conversation needs

    try:
        while True:
            message = await websocket.receive()
            print(f"📨 Received message: {message['type']}")

            if message["type"] == "websocket.disconnect":
                print("🔌 Client disconnected")
                break

            if message.get("bytes"):
                audio_bytes = message["bytes"]

                # Use VAD to detect actual speech instead of just audio presence
                is_speech_detected = vad_service.detect(audio_bytes)

                # If TTS is playing and we receive actual speech (not just noise), stop TTS
                if is_tts_playing and is_speech_detected:
                    print("User started speaking, stopping TTS")
                    await websocket.send_text(json.dumps({"type": "stop_tts"}))
                    is_tts_playing = False
                    silence_counter = 0  # Reset silence counter when speech is detected

                result = stt_service.process_audio(audio_bytes)

                if result and result.get("text", "").strip():
                    text = result["text"]
                    print(f"Recognized: {text}")
                    await websocket.send_text(json.dumps(result))

                # Update silence counter for conversation management
                if is_speech_detected:
                    silence_counter = 0
                else:
                    silence_counter += 1

                # Optional: Handle extended silence periods in conversations
                if silence_counter > silence_threshold:
                    print(f"Extended silence detected ({silence_counter} frames)")

            elif message.get("text"):
                data = json.loads(message["text"])
                if data["type"] == "tts_request":
                    text = data.get("text", "").strip()
                    # print(f"TTS request: '{text}'")

                    try:
                        # print(
                        #     f"Generating TTS audio for: '{text[:50]}{'...' if len(text) > 50 else ''}'"
                        # )

                        audio_bytes = tts_service.synthesize(text)
                        # print(f"TTS audio generated: {len(audio_bytes)} bytes")

                        # First, send the text that will be spoken (for UI display)
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "tts_text",
                                    "text": text,
                                }
                            )
                        )

                        # Then send the audio data as bytes
                        await websocket.send_bytes(audio_bytes)
                        print("TTS audio sent as bytes to client")

                    except Exception as e:
                        print(f"TTS generation error: {e}")
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "error",
                                    "message": f"TTS generation failed: {str(e)}",
                                }
                            )
                        )

                elif data["type"] == "tts_started":
                    # Frontend notifies that TTS playback started
                    is_tts_playing = True
                    print("TTS playback started (notified by frontend)")

                elif data["type"] == "tts_stopped":
                    # Frontend notifies when TTS playback stopped/finished
                    is_tts_playing = False
                    print("TTS playback stopped (notified by frontend)")

            else:
                print(f"Unknown message type: {data['type']}")
                # await websocket.send_text(
                #     json.dumps(
                #         {
                #             "type": "error",
                #             "message": f"Unknown message type: {data['type']}",
                #         }
                #     )
                # )

    except WebSocketDisconnect as e:
        print(f"WebSocket disconnected: {e}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.send_text(
                json.dumps({"type": "error", "message": f"Server error: {str(e)}"})
            )
        except:
            print("Failed to send error message to client")
