import React, { useEffect, useRef, useState } from "react";
import { Send, Download, Square, AudioLines, Mic, VolumeX, Volume2 } from "lucide-react";
import { ChatMessage } from "@/types/chat-message";
import { exportChatAsTXT } from "@/utils/chatUtils";
import { getCurrentDatetime } from "@/utils/dateUtils";
import { getHttpUrl, getWsUrl } from "@/utils/urlUtils";

interface VoiceBotChatActionBarProps {
  threadId: React.RefObject<string | "">;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setIsBotTyping: React.Dispatch<React.SetStateAction<boolean>>;
  isBotTyping: boolean;
  inputPlaceholder: string;
  messages: ChatMessage[];
}

export default function VoiceBotChatActionBar({
  threadId,
  setMessages,
  setIsBotTyping,
  isBotTyping,
  inputPlaceholder,
  messages,
}: VoiceBotChatActionBarProps) {

  const SPEECH_SERVICES_WS_UNIFIED_URL = process.env.NEXT_PUBLIC_SPEECH_SERVICES_WS_UNIFIED_URL as string;
  const SPEECH_SERVICES_HTTP_TTS_URL = process.env.NEXT_PUBLIC_SPEECH_SERVICES_HTTP_TTS_URL as string;
  const SPEECH_SERVICES_WS_STT_URL = process.env.NEXT_PUBLIC_SPEECH_SERVICES_WS_STT_URL as string;

  const [isMuted, setIsMuted] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ws = useRef<WebSocket | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const workletNode = useRef<AudioWorkletNode | null>(null);
  const isBotTypingRef = useRef(false);

  const setBotTyping = (value: boolean) => {
    setIsBotTyping(value);
    isBotTypingRef.current = value;
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [messages]);

  // Keep state and ref in sync with useEffect
  useEffect(() => {
    isBotTypingRef.current = isBotTyping;
  }, [isBotTyping]);

  // TTS Audio Control Newly added
  const currentAudioSource = useRef<AudioBufferSourceNode | null>(null);
  const currentTTSContext = useRef<AudioContext | null>(null);

  const addMessage = (type: 'user' | 'bot', text: string) => {
    const botMessage: ChatMessage = { sender: type, text: text, timestamp: getCurrentDatetime() };
    setMessages(prev => [...prev, botMessage]);
  };

  const stopCurrentTTS = () => {
    console.log('Stopping current TTS playback if any');
    if (currentAudioSource.current) {
      currentAudioSource.current.stop();
      currentAudioSource.current = null;
    }
    if (currentTTSContext.current) {
      currentTTSContext.current.close();
      currentTTSContext.current = null;
    }
    setIsBotSpeaking(false);

    // Notify backend that TTS stopped
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "tts_stopped"
      }));
    }
  };

  const playTTSAudio = async (audioBuffer: ArrayBuffer) => {
    console.log(`Playing TTS audio.`);
    // console.log(`Audio data size: ${audioBuffer.byteLength} bytes`);

    stopCurrentTTS();
    setIsBotSpeaking(true);

    try {
      // Create new AudioContext if needed (separate from STT context to avoid conflicts)
      const ttsAudioContext = new AudioContext();
      currentTTSContext.current = ttsAudioContext;

      if (ttsAudioContext.state === 'suspended') {
        // console.log('Resuming suspended TTS AudioContext');
        await ttsAudioContext.resume();
      }

      // Decode and play audio directly from ArrayBuffer
      const decodedAudioBuffer = await ttsAudioContext.decodeAudioData(audioBuffer);
      // console.log(`Audio decoded successfully, duration: ${decodedAudioBuffer.duration.toFixed(2)}s`);

      const source = ttsAudioContext.createBufferSource();
      currentAudioSource.current = source;
      source.buffer = decodedAudioBuffer;
      source.connect(ttsAudioContext.destination);

      source.onended = () => {
        console.log('TTS playback finished');
        setIsBotSpeaking(false);
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

      console.log('Starting TTS playback');
      source.start();

      // Notify backend that TTS started playing
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: "tts_started"
        }));
      }

    } catch (error) {
      console.error('TTS playback error:', error);
      addMessage('bot', `TTS playback failed: ${error}`);
      setIsBotSpeaking(false);
      currentAudioSource.current = null;
      currentTTSContext.current = null;
    }
  };

  // Define AudioWorkletProcessor inline
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

  const startSession = async () => {
    console.log('Starting unified voice session...');

    if (isVoiceMode) {
      console.log('Session already active');
      return;
    }

    try {
      console.log('Requesting microphone access...');
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
      console.log('Microphone access granted');

      // Create AudioContext for STT
      audioContext.current = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      // console.log(`STT AudioContext created, sample rate: ${audioContext.current.sampleRate}Hz`);

      const blob = new Blob([processorCode], { type: "application/javascript" });
      const moduleURL = URL.createObjectURL(blob);
      await audioContext.current.audioWorklet.addModule(moduleURL);

      const source = audioContext.current.createMediaStreamSource(mediaStream.current);
      workletNode.current = new AudioWorkletNode(audioContext.current, "audio-processor");

      // Handle audio data from worklet
      workletNode.current.port.onmessage = (event: MessageEvent) => {
        // Don't send audio data if bot is typing
        if (isBotTypingRef.current) {
          console.log('Bot is typing, ignoring audio data');
          return; // Ignore audio completely while bot is responding
        }

        if (ws.current && event.data.type === 'audioData' && ws.current.readyState === WebSocket.OPEN) {
          console.log('Sending audio data');
          ws.current.send(event.data.data);
        }
      };

      source.connect(workletNode.current);
      workletNode.current.connect(audioContext.current.destination);

      // Connect WebSocket
      console.log('Connecting to WebSocket...');
      ws.current = new WebSocket(getWsUrl(SPEECH_SERVICES_WS_UNIFIED_URL));

      ws.current.onopen = () => {
        console.log("WebSocket connected");
      };

      ws.current.onmessage = async (event) => {
        console.log("WebSocket message received");


        // Handle binary data (TTS audio) - could be ArrayBuffer or Blob
        if (event.data instanceof ArrayBuffer) {
          console.log('Received TTS audio as ArrayBuffer');
          // console.log(`ArrayBuffer audio data size: ${event.data.byteLength} bytes`);
          playTTSAudio(event.data);
          return;
        } else if (event.data instanceof Blob) {
          console.log('Received TTS audio as Blob');
          // console.log(`Blob audio data size: ${event.data.size} bytes`);

          // Convert Blob to ArrayBuffer
          const arrayBuffer = await event.data.arrayBuffer();
          playTTSAudio(arrayBuffer);
          return;
        }

        // Handle text data (JSON messages)
        try {
          const message = JSON.parse(event.data);
          console.log(`Received message:`, message);

          switch (message.type) {
            case 'stop_tts':
              console.log('Received stop TTS signal');
              stopCurrentTTS();
              break;

            case 'stt_result':
              const recognizedText = message.text;
              console.log(`STT Result: "${recognizedText}"`);
              setBotTyping(true);
              addMessage('user', recognizedText);

              try {
                const response = await generateResponse(recognizedText);
                console.log(`Generated response: "${response}"`);
                addMessage('bot', response);

                // Send TTS request
                if (ws.current?.readyState === WebSocket.OPEN) {
                  console.log('Sending TTS request');
                  ws.current.send(JSON.stringify({
                    type: "tts_request",
                    text: response
                  }));
                }
              } catch (error) {
                console.error('Error generating response:', error);
                addMessage('bot', `Failed to generate response: ${error}`);
              } finally {
                setBotTyping(false);
              }
              break;

            case 'tts_text':
              // New message type to receive the text that will be spoken
              console.log('Received TTS text for display');
              break;

            // case 'stt_partial':
            //     console.log(`Partial STT: "${message.text}"`);
            //     setTranscript(message.text);
            //     break;

            case 'error':
              console.error(`Server error: ${message.message}`);
              addMessage('bot', message.message);
              setBotTyping(false);
              break;

            default:
              console.warn(`Unknown message type: ${message.type}`);
          }
        } catch (err) {
          console.error("Message parsing error:", err);
          addMessage('bot', `Message parsing failed: ${err}`);
          setBotTyping(false);
        }
      };

      ws.current.onerror = (err) => {
        console.error("WebSocket error:", err);
        addMessage('bot', 'WebSocket connection error');
        setIsVoiceMode(false);
      };

      ws.current.onclose = () => {
        console.log("WebSocket closed");
        setIsVoiceMode(false);

      };

      setIsVoiceMode(true);

      console.log('Unified voice session started');

    } catch (error) {
      console.error('Failed to start session:', error);
      addMessage('bot', `Failed to start: ${error}`);
      setIsVoiceMode(false);
      stopSession();
    }
  };

  const stopSession = () => {
    console.log('Stopping unified voice session...');

    stopCurrentTTS();

    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
      console.log('STT AudioContext closed');
    }

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Audio track stopped: ${track.kind}`);
      });
      mediaStream.current = null;
    }

    if (ws.current) {
      ws.current.close();
      ws.current = null;
      console.log('WebSocket closed');
    }

    // Reset state
    setIsVoiceMode(false);
    setIsBotSpeaking(false);
    setIsListening(false);
    console.log('Session stopped');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendButtonClick();
    }
  };

  const generateResponse = async (userText: string) => {
    try {
      // const data = await sendBotMessage(userText);
      // return data.response;

      // Delay for 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      // Sample response generation logic for test locally without API call
      if (!userText || typeof userText !== "string") return "I'm not sure how to respond.";
      const responses = [
        `I heard you say "${userText}". That's interesting!`,
        `You mentioned: "${userText}". Can you tell me more?`,
        `Thanks for saying "${userText}". How can I help you further?`,
        `I understand you said "${userText}". What would you like to know?`,
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    } catch (error) {
      console.error('Bot message error:', error);
      return "Unexpected issue occurs while connecting API.";
    }
  };



  // const sendBotMessage = async (messageText: string) => {

  //   const data = await sendKnowledgeBotMessage({
  //     query_text: messageText,
  //     thread_id: threadId.current,
  //     metadata: {
  //       selected_files: selectedDocuments.map(doc => doc.filename)
  //     }
  //   });

  //   const botMessage: ChatMessage = { sender: "bot", text: data.response, timestamp: getCurrentDatetime() };
  //   setMessages(prev => [...prev, botMessage]);

  //   return data;
  // };

  // const sendMessage = async () => {
  //   const messageText = inputRef.current?.value.trim();

  //   if (!messageText) return;

  //   if (inputRef.current) {
  //     inputRef.current.value = "";
  //   }

  //   const timestamp = getCurrentDatetime();

  //   const newMessage: ChatMessage = { sender: "user", text: messageText, timestamp: timestamp };
  //   setMessages(prev => [...prev, newMessage]);
  //   setIsBotTyping(true);
  //   if (inputRef.current) {
  //     inputRef.current.value = "";
  //   }

  //   try {
  //     await sendBotMessage(messageText);
  //   } catch {
  //     setMessages(prev => [
  //       ...prev,
  //       { sender: "bot", text: "Error fetching reply. Please try again.", timestamp: getCurrentDatetime() },
  //     ]);
  //   } finally {
  //     setIsBotTyping(false);
  //   }
  // };
  const sendMessage = async () => {
    const messageText = inputRef.current?.value.trim();

    if (!messageText) return;

    // Clear input or voice transcript after sending
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    const timestamp = getCurrentDatetime();

    const newMessage: ChatMessage = { sender: "user", text: messageText, timestamp: timestamp };
    setMessages(prev => [...prev, newMessage]);
    setBotTyping(true);

    let botResponse: string = "";

    try {
      // const data = await sendBotMessage(messageText);
      const data = await generateResponse(messageText);
      setMessages(prev => [
        ...prev,
        { sender: "bot", text: data, timestamp: getCurrentDatetime() },
      ]);
      botResponse = data;
    } catch {
      setMessages(prev => [
        ...prev,
        { sender: "bot", text: "Error fetching reply. Please try again.", timestamp: getCurrentDatetime() },
      ]);
      botResponse = "Error fetching reply. Please try again.";
    } finally {
      setBotTyping(false);
      if (!isMuted) {
        await handleSpeak(botResponse);
      }
    }
  };

  const handleSpeak = async (message: string) => {
    stopCurrentTTS();
    try {
      const res = await fetch(getHttpUrl(SPEECH_SERVICES_HTTP_TTS_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });

      const audioData = await res.arrayBuffer();

      playTTSAudio(audioData);
    } catch (err) {
      console.error("TTS playback failed:", err);
      setIsBotSpeaking(false);
    }
  };


  const handleSendButtonClick = () => {
    if (isListening) {
      // here need to turn off the dictate mode, and disconnect the websocket
      setIsListening(false);
    }
    sendMessage();
  };

  const getStatusMessage = () => {
    if (isBotTyping) return "Bot is thinking...";
    if (isBotSpeaking) return "Bot is speaking...";
    if (isListening) return "Listening to you...";
    return "";
  };

  const adjustHeight = () => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto"; // Reset to calculate correct height
      const newHeight = inputRef.current.scrollHeight;
      const maxHeight = 150; // Set a max height limit (adjust as needed)

      if (newHeight > maxHeight) {
        inputRef.current.style.height = `${maxHeight}px`; // Set max height
        inputRef.current.style.overflowY = "auto"; // Enable vertical scrollbar
      } else {
        inputRef.current.style.height = `${newHeight}px`; // Expand normally
        inputRef.current.style.overflowY = "hidden"; // Hide scrollbar if below max height
      }
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => {
      const newMuteState = !prev;
      if (newMuteState) {
        stopCurrentTTS();
      }
      return newMuteState;
    });
  };

  const handleDictateButtonClick = async () => {
    if (isListening) {
      setIsListening(false);
      workletNode.current?.disconnect();
      audioContext.current?.close();
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      ws.current?.close();
      return;
    }
    setIsListening(true);
    if (isVoiceMode) {
      console.log('Session already active');
      return;
    }

    try {
      console.log('Requesting microphone access...');
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
      console.log('Microphone access granted');

      // Create AudioContext for STT
      audioContext.current = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      // console.log(`STT AudioContext created, sample rate: ${ audioContext.current.sampleRate }Hz`);

      const blob = new Blob([processorCode], { type: "application/javascript" });
      const moduleURL = URL.createObjectURL(blob);
      await audioContext.current.audioWorklet.addModule(moduleURL);

      const source = audioContext.current.createMediaStreamSource(mediaStream.current);
      workletNode.current = new AudioWorkletNode(audioContext.current, "audio-processor");

      workletNode.current.port.onmessage = (event: MessageEvent) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(event.data.data);
        }
      };

      source.connect(workletNode.current);
      workletNode.current.connect(audioContext.current.destination);

      // Connect WebSocket
      console.log('Connecting to WebSocket...');
      ws.current = new WebSocket(getWsUrl(SPEECH_SERVICES_WS_STT_URL));
      ws.current.onopen = () => {
        console.log("WebSocket connected");
      };

      ws.current.onmessage = (event) => {
        console.log("WebSocket message received");
        if (inputRef.current) {
          if (inputRef.current.value === '') {
            inputRef.current.value = event.data;
          } else {
            inputRef.current.value += " " + event.data;
          }
        }
      };

      ws.current.onerror = (err) => console.error("WebSocket Error:", err);

      ws.current.onclose = () => {
        console.log("WebSocket closed");

      };
    } catch (error) {
      console.error('Failed to start session:', error);
      addMessage('bot', `Failed to start: ${error} `);
    }
  };

  const handleVoiceModeButtonClick = () => {
    if (isVoiceMode) {
      stopSession();
    }
    else {
      setIsVoiceMode(true);
      setIsListening(true);
      startSession();
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800">
      <div className="px-4 pb-4 max-w-4xl mx-auto">
        {!isVoiceMode && (
          <>
            <div className="bg-white dark:bg-gray-700 rounded-2xl shadow-md border border-gray-200 dark:border-gray-600 p-1">
              <div className="flex items-end gap-3">
                <textarea
                  className="text-base w-full p-3 pr-12 rounded-xl resize-none focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 disabled:opacity-50"
                  placeholder={inputPlaceholder}
                  ref={inputRef}
                  onKeyDown={handleKeyDown}
                  disabled={isBotTyping}
                  onInput={adjustHeight}
                  rows={1}
                />
              </div>
              <div className="p-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">

                    <button
                      className={`p-2 rounded-lg ${isMuted
                        ? "bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                        : "bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                        }`}
                      onClick={toggleMute}
                      title={isMuted ? "Unmute" : "Mute"}
                    >
                      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>

                    <button
                      className={`p-2 rounded-lg ${isListening
                        ? "bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                        : "bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                        }`}
                      onClick={handleDictateButtonClick}
                      title="Dictate"
                      disabled={isBotTyping}
                    >
                      <Mic size={18} />
                    </button>

                    <button
                      className={`p-2 rounded-lg ${isVoiceMode
                        ? "bg-gray-300 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                        : "bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                        }`}
                      onClick={handleVoiceModeButtonClick}
                      title="Voice Mode"
                    >
                      <AudioLines size={18} />
                    </button>

                    <button
                      className="p-2 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg"
                      onClick={() => exportChatAsTXT(messages, threadId.current)}
                      title="Download chat as TXT"
                    >
                      <Download size={18} />
                    </button>
                  </div>

                  <button
                    onClick={handleSendButtonClick}
                    disabled={isBotTyping}
                    className="p-2 bg-primary text-white hover:bg-secondary rounded-lg disabled:opacity-50"
                    title="Send"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </>)}
        {isVoiceMode && getStatusMessage() && (
          <div className="mb-4 text-center">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-sm animate-pulse shadow-sm">
              <span>{getStatusMessage()}</span>
              <button
                className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors"
                onClick={handleVoiceModeButtonClick}
                title="Stop Voice Mode"
                aria-label="Stop Voice Mode"
              >
                <Square size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
