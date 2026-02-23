# import base64
# from fastapi import FastAPI, WebSocket, Request
# from fastapi.middleware.cors import CORSMiddleware
# from starlette.websockets import WebSocketDisconnect
# from vosk import Model, KaldiRecognizer
# import numpy as np
# import json
# from fastapi.responses import StreamingResponse, JSONResponse
# from io import BytesIO
# import wave
# from piper import PiperVoice
# import torch


# app = FastAPI()

# # Allow CORS for local dev
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=False,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# # Load Vosk model
# # model = Model("vosk-model-small-en-us-0.15")
# # model = Model("vosk-model-en-in-0.5")
# model = Model("vosk-model-en-us-0.42-gigaspeech")
# voice = PiperVoice.load("en_US-amy-low.onnx")


# @app.websocket("/ws/testing")
# async def websocket_endpoint(websocket: WebSocket):
#     await websocket.accept()
#     print("connection open")
#     try:
#         while True:
#             data = await websocket.receive_text()
#             print(f"Received: {data}")
#             await websocket.send_text(f"Server says: Received '{data}'")
#     except WebSocketDisconnect:
#         print("connection closed")


# @app.websocket("/ws/first")
# async def websocket_endpoint(websocket: WebSocket):
#     await websocket.accept()
#     recognizer = KaldiRecognizer(model, 16000)
#     recognizer.SetWords(True)

#     try:
#         while True:
#             data = await websocket.receive_bytes()
#             pcm = np.frombuffer(data, dtype=np.int16)

#             if recognizer.AcceptWaveform(pcm.tobytes()):
#                 result = json.loads(recognizer.Result())
#                 text = result.get("text", "")
#                 if text.strip():
#                     print(f"Recognized: {text}")
#                     await websocket.send_text(text)
#             # else:
#             #     partial = json.loads(recognizer.PartialResult())
#             #     partial_text = partial.get("partial", "")
#             #     if partial_text.strip():
#             #         await websocket.send_text(partial_text)

#     except WebSocketDisconnect:
#         print("Client disconnected")
#     except Exception as e:
#         print(f"Error: {e}")


# @app.post("/speak")
# async def speak(request: Request):
#     body = await request.json()
#     text = body.get("text", "").strip()

#     if not text:
#         return JSONResponse(content={"error": "No text provided"}, status_code=400)

#     try:
#         # Create WAV file in memory using Piper's synthesize_wav method
#         wav_io = BytesIO()
#         with wave.open(wav_io, "wb") as wav_file:
#             voice.synthesize_wav(text, wav_file)

#         wav_io.seek(0)
#         wav_data = wav_io.getvalue()

#         return StreamingResponse(
#             BytesIO(wav_data),
#             media_type="audio/wav",
#             headers={"Content-Length": str(len(wav_data))},
#         )

#     except Exception as e:
#         print(f"TTS Error: {e}")
#         return JSONResponse(content={"error": f"TTS failed: {str(e)}"}, status_code=500)


# # Load Silero VAD model
# vad_model, utils = torch.hub.load(
#     repo_or_dir="snakers4/silero-vad", model="silero_vad", force_reload=False
# )
# (get_speech_timestamps, _, _, _, _) = utils


# def process_audio_chunk(audio_bytes: bytes) -> bool:
#     """Process audio chunk and return True if speech is detected"""
#     try:
#         # Convert bytes to int16 numpy array
#         audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)

#         # Normalize int16 to float32 in range [-1, 1]
#         audio_float32 = audio_int16.astype(np.float32) / 32768.0

#         # Convert to PyTorch tensor
#         audio_tensor = torch.from_numpy(audio_float32)

#         # Ensure tensor is 1D
#         if len(audio_tensor.shape) > 1:
#             audio_tensor = audio_tensor.squeeze()

#         # Skip if audio chunk is too short
#         if len(audio_tensor) < 512:  # Minimum chunk size
#             return False

#         # print(
#         #     f"Processing audio chunk: shape={audio_tensor.shape}, dtype={audio_tensor.dtype}, min={audio_tensor.min():.3f}, max={audio_tensor.max():.3f}"
#         # )

#         # Run VAD - adjust parameters for better sensitivity
#         speech_timestamps = get_speech_timestamps(
#             audio_tensor,
#             vad_model,
#             sampling_rate=16000,
#             threshold=0.3,  # Lower threshold for more sensitivity
#             min_speech_duration_ms=100,  # Shorter minimum speech duration
#             min_silence_duration_ms=50,  # Shorter minimum silence duration
#         )

#         has_speech = len(speech_timestamps) > 0
#         # print(f"VAD result: {len(speech_timestamps)} speech segments found")

#         # if has_speech:
#         #     for timestamp in speech_timestamps:
#         #         start_sec = timestamp["start"] / 16000
#         #         end_sec = timestamp["end"] / 16000
#         #         print(f"Speech segment: {start_sec:.2f}s - {end_sec:.2f}s")

#         # Only log when speech is detected to reduce noise
#         if has_speech:
#             print(f"VAD: {len(speech_timestamps)} speech segments found")

#         return has_speech

#     except Exception as e:
#         print(f"Error processing audio: {e}")
#         return False


# @app.websocket("/ws/vad")
# async def websocket_audio(websocket: WebSocket):
#     await websocket.accept()

#     # Each connection gets its own state
#     audio_buffer = bytearray()
#     silence_counter = 0
#     silence_threshold = 20

#     try:
#         while True:
#             # Receive JSON message instead of bytes
#             message = await websocket.receive()
#             print(f"Received message: {message['type']}")

#             if message["type"] == "websocket.disconnect":
#                 print("Client disconnected")
#                 break

#             if message.get("bytes"):
#                 audio_bytes = message["bytes"]
#                 # print(f"Received binary audio: {len(audio_bytes)} bytes")

#                 # Process the audio chunk
#                 has_speech = process_audio_chunk(audio_bytes)

#                 if has_speech:
#                     print("Speech detected!")
#                     audio_buffer.extend(audio_bytes)
#                     silence_counter = 0
#                     # Send immediate feedback
#                     await websocket.send_text(
#                         '{"status": "speech", "message": "Speech detected"}'
#                     )
#                 else:
#                     print("No speech detected")
#                     silence_counter += 1
#                     await websocket.send_text(
#                         '{"status": "silence", "message": "No speech"}'
#                     )

#                     if silence_counter > silence_threshold and len(audio_buffer) > 0:
#                         print("Speech segment finished, processing...")
#                         await websocket.send_text(
#                             '{"status": "segment_complete", "message": "Speech segment completed"}'
#                         )
#                         audio_buffer.clear()
#                         silence_counter = 0

#             elif message.get("text"):
#                 data = json.loads(message["text"])

#                 if data["type"] == "audio":

#                     # audio_bytes = await websocket.receive_bytes()
#                     # print(f"Received audio chunk: {len(audio_bytes)} bytes")

#                     audio_bytes = base64.b64decode(data["data"])
#                     # print(f"Received audio chunk: {len(audio_bytes)} bytes")

#                     # Process the audio chunk
#                     has_speech = process_audio_chunk(audio_bytes)

#                     if has_speech:
#                         print("Speech detected!")
#                         audio_buffer.extend(audio_bytes)
#                         silence_counter = 0
#                         # Send immediate feedback
#                         await websocket.send_text(
#                             '{"status": "speech", "message": "Speech detected"}'
#                         )
#                     else:
#                         print("No speech detected")
#                         silence_counter += 1
#                         await websocket.send_text(
#                             '{"status": "silence", "message": "No speech"}'
#                         )

#                         if (
#                             silence_counter > silence_threshold
#                             and len(audio_buffer) > 0
#                         ):
#                             print("Speech segment finished, processing...")
#                             await websocket.send_text(
#                                 '{"status": "segment_complete", "message": "Speech segment completed"}'
#                             )
#                             audio_buffer.clear()
#                             silence_counter = 0

#     except WebSocketDisconnect:
#         print("WebSocket disconnected")
#     except Exception as e:
#         print(f"WebSocket error: {e}")


# @app.websocket("/ws/unified")
# async def websocket_endpoint(websocket: WebSocket):
#     print("Client connecting...")
#     await websocket.accept()
#     print("WebSocket connected")

#     # Create fresh recognizer for this connection
#     recognizer = KaldiRecognizer(model, 16000)
#     recognizer.SetWords(True)
#     print("STT recognizer initialized")

#     # Track TTS state // Newly added
#     is_tts_playing = False

#     # VAD tracking variables for banking conversation flow
#     silence_counter = 0
#     silence_threshold = 5  # Adjust based on banking conversation needs

#     try:
#         while True:
#             message = await websocket.receive()
#             print(f"Received message: {message['type']}")

#             if message["type"] == "websocket.disconnect":
#                 print("Client disconnected")
#                 break

#             if message.get("bytes"):
#                 audio_bytes = message["bytes"]

#                 # Use VAD to detect actual speech instead of just audio presence
#                 is_speech_detected = process_audio_chunk(audio_bytes)

#                 # If TTS is playing and we receive actual speech (not just noise), stop TTS
#                 if is_tts_playing and is_speech_detected:
#                     print("User started speaking, stopping TTS")
#                     await websocket.send_text(json.dumps({"type": "stop_tts"}))
#                     is_tts_playing = False
#                     silence_counter = 0  # Reset silence counter when speech is detected

#                 if recognizer.AcceptWaveform(audio_bytes):
#                     result = json.loads(recognizer.Result())
#                     text = result.get("text", "").strip()
#                     if text:
#                         print(f"STT Result: '{text}'")
#                         await websocket.send_text(
#                             json.dumps(
#                                 {
#                                     "type": "stt_result",
#                                     "text": text,
#                                     "confidence": result.get("conf", 0),
#                                 }
#                             )
#                         )
#                 else:
#                     # Handle partial results
#                     partial_result = json.loads(recognizer.PartialResult())
#                     partial_text = partial_result.get("partial", "").strip()
#                     if partial_text:
#                         print(f"Partial STT: '{partial_text}'")
#                         # If we have partial results and TTS is playing, stop TTS
#                         if is_tts_playing and is_speech_detected:
#                             print("User started speaking (partial), stopping TTS")
#                             await websocket.send_text(json.dumps({"type": "stop_tts"}))
#                             is_tts_playing = False

#                         # Need to check this
#                         # await websocket.send_text(
#                         #     json.dumps({"type": "stt_partial", "text": partial_text})
#                         # )

#                 # Update silence counter for banking conversation management
#                 if is_speech_detected:
#                     silence_counter = 0
#                 else:
#                     silence_counter += 1

#                 # Optional: Handle extended silence periods in banking conversations
#                 if silence_counter > silence_threshold:
#                     print(f"Extended silence detected ({silence_counter} frames)")
#                     # You can add banking-specific logic here, like prompting the user

#             elif message.get("text"):
#                 data = json.loads(message["text"])
#                 if data["type"] == "tts_request":
#                     text = data.get("text", "").strip()
#                     print(f"TTS request: '{text}'")

#                     if not text:
#                         print("Empty TTS text received")
#                         await websocket.send_text(
#                             json.dumps({"type": "error", "message": "Empty TTS text"})
#                         )
#                         continue

#                     try:
#                         # print(
#                         #     f"Generating TTS audio for: '{text[:50]}{'...' if len(text) > 50 else ''}'"
#                         # )

#                         # Generate WAV audio
#                         buffer = BytesIO()
#                         with wave.open(buffer, "wb") as wav_file:
#                             voice.synthesize_wav(text, wav_file)

#                         buffer.seek(0)
#                         audio_bytes = buffer.getvalue()
#                         print(f"TTS audio generated: {len(audio_bytes)} bytes")

#                         # First, send the text that will be spoken (for UI display)
#                         await websocket.send_text(
#                             json.dumps(
#                                 {
#                                     "type": "tts_text",
#                                     "text": text,
#                                 }
#                             )
#                         )

#                         # Then send the audio data as bytes
#                         await websocket.send_bytes(audio_bytes)
#                         print("TTS audio sent as bytes to client")

#                     except Exception as e:
#                         print(f"TTS generation error: {e}")
#                         await websocket.send_text(
#                             json.dumps(
#                                 {
#                                     "type": "error",
#                                     "message": f"TTS generation failed: {str(e)}",
#                                 }
#                             )
#                         )

#                 elif data["type"] == "tts_started":
#                     # Frontend notifies that TTS playback started
#                     is_tts_playing = True
#                     print("TTS playback started (notified by frontend)")

#                 elif data["type"] == "tts_stopped":
#                     # Frontend notifies when TTS playback stopped/finished
#                     is_tts_playing = False
#                     print("TTS playback stopped (notified by frontend)")

#             else:
#                 print(f"Unknown message type: {data['type']}")
#                 # await websocket.send_text(
#                 #     json.dumps(
#                 #         {
#                 #             "type": "error",
#                 #             "message": f"Unknown message type: {data['type']}",
#                 #         }
#                 #     )
#                 # )

#     except WebSocketDisconnect as e:
#         print(f"WebSocket disconnected: {e}")
#     except Exception as e:
#         print(f"WebSocket error: {e}")
#         try:
#             await websocket.send_text(
#                 json.dumps({"type": "error", "message": f"Server error: {str(e)}"})
#             )
#         except:
#             print("Failed to send error message to client")
