"use client";

// import { sendBankingBotMessage } from "@/services/bankingBotService";
// import { getConversationId } from "@/services/conversationService";
import { getWsUrl } from "@/utils/urlUtils";
import { useEffect, useRef, useState } from "react";

export default function UnifiedVoicePage() {

    const SPEECH_SERVICES_WS_UNIFIED_URL = process.env.NEXT_PUBLIC_SPEECH_SERVICES_WS_UNIFIED_URL as string;

    const ws = useRef<WebSocket | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const mediaStream = useRef<MediaStream | null>(null);
    const workletNode = useRef<AudioWorkletNode | null>(null);
    const isBotTypingRef = useRef(false);

    const setBotTyping = (value: boolean) => {
        isBotTypingRef.current = value;
    };

    // State
    const [isActive, setIsActive] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [transcript, setTranscript] = useState("");
    const [currentSpeaking, setCurrentSpeaking] = useState("");
    const [isPlaying, setIsPlaying] = useState(false);
    const [messages, setMessages] = useState<Array<{ type: 'user' | 'bot' | 'error', text: string, timestamp: Date }>>([]);

    const conversationId = useRef<string>("");


    // TTS Audio Control Newly added
    const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
    const currentTTSContext = useRef<AudioContext | null>(null);

    useEffect(() => {
        const fetchConversationId = async () => {
            try {
                // const response = await getConversationId();
                conversationId.current = "dummy";

                // setTimeout(() => {
                //   setIsConversationLoaded(true);
                // }, 5000); // Setting delay for testing loading screen

            } catch {
                conversationId.current = "";
            }
        };

        fetchConversationId();
    }, []);

    const addMessage = (type: 'user' | 'bot' | 'error', text: string) => {
        console.log(`📝 Adding ${type} message: ${text}`);
        setMessages(prev => [...prev, { type, text, timestamp: new Date() }]);
    };

    const stopCurrentTTS = () => {
        console.log('🛑 Stopping current TTS playback if any');
        if (currentAudioSource.current) {
            currentAudioSource.current.stop();
            currentAudioSource.current = null;
        }
        if (currentTTSContext.current) {
            currentTTSContext.current.close();
            currentTTSContext.current = null;
        }
        setIsPlaying(false);
        setCurrentSpeaking("");

        // Notify backend that TTS stopped
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({
                type: "tts_stopped"
            }));
        }
    };

    // const playTTSAudio = async (audioBase64: string, text: string) => {
    const playTTSAudio = async (audioBuffer: ArrayBuffer, text: string) => {
        console.log(`🔊 Playing TTS audio for: "${text}"`);
        console.log(`🎵 Audio data size: ${audioBuffer.byteLength} bytes`);

        // Stop any currently playing TTS
        stopCurrentTTS();

        setIsPlaying(true);
        setCurrentSpeaking(text);

        try {
            // Create new AudioContext if needed (separate from STT context to avoid conflicts)
            const ttsAudioContext = new AudioContext();
            currentTTSContext.current = ttsAudioContext;

            if (ttsAudioContext.state === 'suspended') {
                // console.log('🔓 Resuming suspended TTS AudioContext');
                await ttsAudioContext.resume();
            }

            // Decode and play audio directly from ArrayBuffer
            const decodedAudioBuffer = await ttsAudioContext.decodeAudioData(audioBuffer);
            console.log(`✅ Audio decoded successfully, duration: ${decodedAudioBuffer.duration.toFixed(2)}s`);

            const source = ttsAudioContext.createBufferSource();
            currentAudioSource.current = source;
            // source.buffer = audioBuffer;
            source.buffer = decodedAudioBuffer;
            source.connect(ttsAudioContext.destination);

            source.onended = () => {
                console.log('🏁 TTS playback finished');
                setIsPlaying(false);
                setCurrentSpeaking("");
                currentAudioSource.current = null;
                if (currentTTSContext.current) {
                    currentTTSContext.current.close();
                    currentTTSContext.current = null;
                }

                // Notify backend that TTS finished
                if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(JSON.stringify({
                        type: "tts_stopped"
                    }));
                }
            };

            console.log('▶️ Starting TTS playback');
            source.start();

            // Notify backend that TTS started playing
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({
                    type: "tts_started"
                }));
            }

        } catch (error) {
            console.error('❌ TTS playback error:', error);
            addMessage('error', `TTS playback failed: ${error}`);
            setIsPlaying(false);
            setCurrentSpeaking("");
            currentAudioSource.current = null;
            currentTTSContext.current = null;
        }
    };

    // const sendBotMessage = async (messageText: string) => {
    //     const data = await sendBankingBotMessage({
    //         query: messageText,
    //         llm_model: selectedLlmModel,
    //         user_token: userToken.current,
    //         conversation_id: conversationId.current,
    //         metadata: {
    //             current_datetime: getCurrentDatetime(),
    //             is_voice_mode_enabled: true,
    //         }
    //     });
    //     userToken.current = data.user_token;

    //     return data;
    // };

    const generateResponse = async (userText: string) => {
        try {
            // const data = await sendBotMessage(userText);
            // return data.response;

            // Delay for 6 seconds
            await new Promise(resolve => setTimeout(resolve, 8000));
            //  Sample response generation logic
            if (!userText || typeof userText !== "string") return "I'm not sure how to respond.";
            const responses = [
                `I heard you say "${userText}". That's interesting!`,
                `You mentioned: "${userText}". Can you tell me more?`,
                `Thanks for saying "${userText}". How can I help you further?`,
                `I understand you said "${userText}". What would you like to know?`,
            ];
            return responses[Math.floor(Math.random() * responses.length)];
        } catch (error) {
            console.error('❌ Bot message error:', error);
            throw error; // Let the caller handle the error
        }
        // Don't set setBotTyping(false) here - it's handled in the message handler
    };

    const startSession = async () => {
        console.log('🚀 Starting unified voice session...');

        if (isActive) {
            console.log('⚠️ Session already active');
            return;
        }

        try {
            setConnectionStatus('connecting');
            console.log('🎤 Requesting microphone access...');

            // Get microphone stream
            mediaStream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
                video: false,
            });
            console.log('✅ Microphone access granted');

            // Create AudioContext for STT
            audioContext.current = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
            console.log(`🎵 STT AudioContext created, sample rate: ${audioContext.current.sampleRate}Hz`);

            // ✅ Define AudioWorkletProcessor inline
            const processorCode = `
      class InlineProcessor extends AudioWorkletProcessor {
          constructor() {
            super();
            this.bufferSize = 2048; // Balanced for banking: lower latency, good quality
            this.buffer = new Float32Array(this.bufferSize);
            this.bufferIndex = 0;
            this.previousSample = 0;
          }

          // Noise gate for banking environments (removes keyboard/background noise)
          applyNoiseGate(sample, threshold = 0.01) {
            return Math.abs(sample) < threshold ? 0 : sample;
          }

          // High-pass filter to reduce low-frequency noise (AC hum, traffic)
          highPassFilter(sample, cutoff = 0.02) {
            const filtered = sample - this.previousSample * cutoff;
            this.previousSample = sample;
            return filtered;
          }

          // Dynamic range compression for consistent volume
          compress(sample, ratio = 0.7) {
            const threshold = 0.3;
            if (Math.abs(sample) > threshold) {
              const excess = Math.abs(sample) - threshold;
              const compressedExcess = excess * ratio;
              return sample > 0 ? threshold + compressedExcess : -(threshold + compressedExcess);
            }
            return sample;
          }

          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input.length > 0) {
              const channelData = input[0];
              
              // Buffer the audio data with banking-specific processing
              for (let i = 0; i < channelData.length; i++) {
                let sample = channelData[i];
                
                // Apply banking-optimized audio processing
                sample = this.applyNoiseGate(sample, 0.008); // Reduce background noise
                sample = this.highPassFilter(sample); // Remove low-frequency noise
                sample = this.compress(sample); // Normalize volume for clear banking terms
                
                this.buffer[this.bufferIndex] = sample;
                this.bufferIndex++;
                
                // Send when buffer is full
                if (this.bufferIndex >= this.bufferSize) {
                  const int16Data = new Int16Array(this.bufferSize);
                  
                  // Convert float32 to int16 with enhanced precision for banking terms
                  for (let j = 0; j < this.bufferSize; j++) {
                    let processedSample = Math.max(-1, Math.min(1, this.buffer[j]));
                    
                    // Add minimal dithering to reduce quantization noise on quiet speech
                    const dither = (Math.random() - 0.5) * (1.0 / 65536.0);
                    processedSample += dither;
                    
                    // Convert with proper scaling
                    int16Data[j] = processedSample < 0 ? 
                      processedSample * 0x8000 : processedSample * 0x7FFF;
                  }

                  // Send the processed buffer
                  this.port.postMessage({
                    type: 'audioData',
                    data: int16Data.buffer,
                    sampleRate: 16000,
                    bufferSize: this.bufferSize,
                    quality: 'banking-optimized'
                  }, [int16Data.buffer]);
                  
                  // Reset buffer
                  this.bufferIndex = 0;
                }
              }
            }
            return true;
          }
        }

        registerProcessor('audio-processor', InlineProcessor);
      `;
            const blob = new Blob([processorCode], { type: "application/javascript" });
            const moduleURL = URL.createObjectURL(blob);
            await audioContext.current.audioWorklet.addModule(moduleURL);

            const source = audioContext.current.createMediaStreamSource(mediaStream.current);
            workletNode.current = new AudioWorkletNode(audioContext.current, "audio-processor");

            // Handle audio data from worklet
            workletNode.current.port.onmessage = (event: MessageEvent) => {
                // ✅ Don't send audio data if bot is typing
                if (isBotTypingRef.current) {
                    console.log('🤖 Bot is typing, ignoring audio data');
                    return; // Ignore audio completely while bot is responding
                }

                if (ws.current && event.data.type === 'audioData' && ws.current.readyState === WebSocket.OPEN) {
                    console.log('🤖 Sending audio data');
                    ws.current.send(event.data.data);
                }
            };

            source.connect(workletNode.current);
            workletNode.current.connect(audioContext.current.destination);

            // Connect WebSocket
            console.log('🔌 Connecting to WebSocket...');
            ws.current = new WebSocket(getWsUrl(SPEECH_SERVICES_WS_UNIFIED_URL));

            ws.current.onopen = () => {
                console.log("✅ WebSocket connected");
                setConnectionStatus('connected');
                addMessage('bot', 'Voice system connected. Start speaking!');
            };

            ws.current.onmessage = async (event) => {
                console.log("📨 WebSocket message received");


                // Handle binary data (TTS audio) - could be ArrayBuffer or Blob
                if (event.data instanceof ArrayBuffer) {
                    console.log('🔊 Received TTS audio as ArrayBuffer');
                    console.log(`🎵 ArrayBuffer audio data size: ${event.data.byteLength} bytes`);

                    // const spokenText = currentSpeaking || "Audio response";
                    // addMessage('bot', spokenText);
                    // Don't add message here - wait for tts_text message
                    const spokenText = currentSpeaking || ""; // Use empty string or current text
                    playTTSAudio(event.data, spokenText);
                    return;
                } else if (event.data instanceof Blob) {
                    console.log('🔊 Received TTS audio as Blob');
                    console.log(`🎵 Blob audio data size: ${event.data.size} bytes`);

                    // Convert Blob to ArrayBuffer
                    const arrayBuffer = await event.data.arrayBuffer();
                    // const spokenText = currentSpeaking || "Audio response";
                    // addMessage('bot', spokenText);
                    // Don't add message here - wait for tts_text message
                    const spokenText = currentSpeaking || ""; // Use empty string or current text
                    playTTSAudio(arrayBuffer, spokenText);
                    return;
                }

                // Handle text data (JSON messages)
                try {
                    const message = JSON.parse(event.data);
                    console.log(`📨 Received message:`, message);

                    switch (message.type) {
                        case 'stop_tts':
                            // console.log('🛑 Received stop TTS signal');
                            stopCurrentTTS();
                            break;

                        case 'stt_result':
                            const recognizedText = message.text;
                            console.log(`🗣️ STT Result: "${recognizedText}"`);

                            // Set bot typing IMMEDIATELY when STT result arrives
                            setBotTyping(true);

                            setTranscript(recognizedText);
                            addMessage('user', recognizedText);

                            try {
                                const response = await generateResponse(recognizedText);
                                console.log(`🤖 Generated response: "${response}"`);

                                // Send TTS request
                                if (ws.current?.readyState === WebSocket.OPEN) {
                                    console.log('📤 Sending TTS request');
                                    ws.current.send(JSON.stringify({
                                        type: "tts_request",
                                        text: response
                                    }));
                                }
                            } catch (error) {
                                console.error('❌ Error generating response:', error);
                                addMessage('error', `Failed to generate response: ${error}`);
                            } finally {
                                // Clear bot typing state after processing
                                setBotTyping(false);
                            }
                            break;

                        case 'tts_text':
                            // New message type to receive the text that will be spoken
                            console.log('📝 Received TTS text for display');
                            // setCurrentSpeaking(message.text);
                            const ttsText = message.text;
                            setCurrentSpeaking(ttsText);

                            // Add the message to chat history HERE instead of when receiving audio
                            addMessage('bot', ttsText);
                            break;

                        // case 'stt_partial':
                        //     console.log(`🔄 Partial STT: "${message.text}"`);
                        //     setTranscript(message.text);
                        //     break;

                        case 'error':
                            console.error(`❌ Server error: ${message.message}`);
                            addMessage('error', message.message);
                            setBotTyping(false);
                            break;

                        default:
                            console.warn(`⚠️ Unknown message type: ${message.type}`);
                    }
                } catch (err) {
                    console.error("❌ Message parsing error:", err);
                    addMessage('error', `Message parsing failed: ${err}`);
                    setBotTyping(false);
                }
            };

            ws.current.onerror = (err) => {
                console.error("❌ WebSocket error:", err);
                addMessage('error', 'WebSocket connection error');
                setConnectionStatus('disconnected');
            };

            ws.current.onclose = () => {
                console.log("🔌 WebSocket closed");
                setConnectionStatus('disconnected');
                addMessage('error', 'Connection lost');
            };

            console.log('🔗 Audio graph connected');
            setIsActive(true);
            console.log('✅ Unified voice session started');

        } catch (error) {
            console.error('❌ Failed to start session:', error);
            addMessage('error', `Failed to start: ${error}`);
            setConnectionStatus('disconnected');
            stopSession();
        }
    };

    const stopSession = () => {
        console.log('🛑 Stopping unified voice session...');

        // Stop any playing TTS
        stopCurrentTTS();

        if (audioContext.current) {
            audioContext.current.close();
            audioContext.current = null;
            console.log('🔇 STT AudioContext closed');
        }

        if (mediaStream.current) {
            mediaStream.current.getTracks().forEach(track => {
                track.stop();
                console.log(`🎤 Audio track stopped: ${track.kind}`);
            });
            mediaStream.current = null;
        }

        if (ws.current) {
            ws.current.close();
            ws.current = null;
            console.log('🔌 WebSocket closed');
        }

        // Reset state
        setIsActive(false);
        setConnectionStatus('disconnected');
        setTranscript("");
        setCurrentSpeaking("");
        setIsPlaying(false);
        console.log('✅ Session stopped');
    };

    const getStatusColor = () => {
        if (isBotTypingRef.current) return 'bg-orange-500';
        if (isPlaying) return 'bg-purple-500';
        if (isActive && connectionStatus === 'connected') return 'bg-green-500';
        if (connectionStatus === 'connecting') return 'bg-yellow-500';
        return 'bg-gray-400';
    };

    const getStatusText = () => {
        if (isBotTypingRef.current) return 'Bot is thinking...';
        if (isPlaying) return 'Speaking';
        if (isActive && connectionStatus === 'connected') return 'Listening';
        if (connectionStatus === 'connecting') return 'Connecting';
        return 'Inactive';
    };

    useEffect(() => {
        return () => {
            console.log('🧹 Component unmounting, cleaning up...');
            stopSession();
        };
    }, []);

    return (
        <div className="min-h-screen bg-white dark:bg-gray-800 p-6">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        Unified Voice Assistant
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300">
                        One-click voice conversation with real-time STT and TTS
                    </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700 rounded-2xl shadow-lg p-8 mb-6">
                    <div className="text-center">
                        <div className="flex items-center justify-center mb-6">
                            <div className={`w-4 h-4 rounded-full mr-3 ${getStatusColor()}`}></div>
                            <span className="text-lg font-semibold text-gray-700 dark:text-gray-200">
                                {getStatusText()}
                            </span>
                        </div>

                        <button
                            onClick={isActive ? stopSession : startSession}
                            disabled={connectionStatus === 'connecting'}
                            className={`w-32 h-32 rounded-full text-2xl font-bold text-white shadow-lg transition-all duration-200 transform hover:scale-105 ${isActive
                                ? 'bg-red-500 hover:bg-red-600'
                                : connectionStatus === 'connecting'
                                    ? 'bg-yellow-500 cursor-not-allowed'
                                    : 'bg-blue-500 hover:bg-blue-600'
                                }`}
                        >
                            {connectionStatus === 'connecting' ? '⏳' : isActive ? '🛑' : '🎤'}
                        </button>

                        <div className="mt-4">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {isActive ? 'Click to stop voice session' : 'Click to start voice session'}
                            </p>
                        </div>
                    </div>
                </div>

                {(transcript || currentSpeaking) && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-xl shadow-md p-6 mb-6">
                        {transcript && (
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">
                                    🎤 You're saying:
                                </h3>
                                <p className="text-lg text-gray-800 dark:text-gray-200 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                                    {transcript}
                                </p>
                            </div>
                        )}

                        {currentSpeaking && (
                            <div>
                                <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-2">
                                    🔊 Assistant is saying:
                                </h3>
                                <p className="text-lg text-gray-800 dark:text-gray-200 bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg">
                                    {currentSpeaking}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div className="bg-gray-50 dark:bg-gray-700 rounded-xl shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
                        💬 Conversation History
                    </h3>

                    <div className="space-y-3 max-h-96 overflow-y-auto">
                        {messages.length === 0 ? (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                                No messages yet. Start speaking to begin the conversation.
                            </p>
                        ) : (
                            messages.map((msg, index) => (
                                <div
                                    key={index}
                                    className={`p-3 rounded-lg ${msg.type === 'user'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 ml-8'
                                        : msg.type === 'bot'
                                            ? 'bg-green-100 dark:bg-green-900/30 mr-8'
                                            : 'bg-red-100 dark:bg-red-900/30'
                                        }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <span className={`text-sm font-semibold ${msg.type === 'user' ? 'text-blue-600 dark:text-blue-400' :
                                                msg.type === 'bot' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                {msg.type === 'user' ? '👤 You' :
                                                    msg.type === 'bot' ? '🤖 Assistant' : '❌ Error'}:
                                            </span>
                                            <p className="text-gray-800 dark:text-gray-200 mt-1">{msg.text}</p>
                                        </div>
                                        <span className="text-xs text-gray-400 ml-2">
                                            {msg.timestamp.toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}