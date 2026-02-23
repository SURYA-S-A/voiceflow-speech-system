"use client";

import { getWsUrl } from "@/utils/urlUtils";
import { useEffect, useRef, useState } from "react";

export default function VoiceStreamer() {

  const SPEECH_SERVICES_WS_VAD_URL = process.env.NEXT_PUBLIC_SPEECH_SERVICES_WS_VAD_URL as string;

  const [isStreaming, setIsStreaming] = useState(false);
  const [vadStatus, setVadStatus] = useState<string>("idle");
  const [lastMessage, setLastMessage] = useState<string>("");

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startStreaming = async () => {
    try {
      // Request microphone with specific constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });

      streamRef.current = stream;

      // Create AudioContext with 16kHz sample rate
      const audioContext = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
      console.log("AudioContext sample rate:", audioContext.sampleRate);

      // Enhanced AudioWorklet processor
      // const processorCode = `
      //             class InlineProcessor extends AudioWorkletProcessor {
      //                 constructor() {
      //                     super();
      //                     this.bufferSize = 4096; // Process in larger chunks
      //                     this.bufferSize = 2048; // Balanced for banking: lower latency, good quality
      //                     this.buffer = new Float32Array(this.bufferSize);
      //                     this.bufferIndex = 0;
      //                 }

      //                 process(inputs, outputs, parameters) {
      //                     const input = inputs[0];
      //                     if (input.length > 0) {
      //                         const channelData = input[0];

      //                         // Buffer the audio data
      //                         for (let i = 0; i < channelData.length; i++) {
      //                             this.buffer[this.bufferIndex] = channelData[i];
      //                             this.bufferIndex++;

      //                             // Send when buffer is full
      //                             if (this.bufferIndex >= this.bufferSize) {
      //                                 const int16Data = new Int16Array(this.bufferSize);

      //                                 // Convert float32 to int16 with proper scaling
      //                                 for (let j = 0; j < this.bufferSize; j++) {
      //                                     let sample = Math.max(-1, Math.min(1, this.buffer[j]));
      //                                     int16Data[j] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      //                                 }

      //                                 // Send the buffer
      //                                 this.port.postMessage({
      //                                     type: 'audioData',
      //                                     data: int16Data.buffer
      //                                 }, [int16Data.buffer]);

      //                                 // Reset buffer
      //                                 this.bufferIndex = 0;
      //                             }
      //                         }
      //                     }
      //                     return true;
      //                 }
      //             }

      //             registerProcessor('audio-processor', InlineProcessor);
      //         `;

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

      const blob = new Blob([processorCode], { type: 'application/javascript' });
      const blobURL = URL.createObjectURL(blob);

      await audioContext.audioWorklet.addModule(blobURL);

      const micSource = audioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");

      // Connect WebSocket
      const socket = new WebSocket(getWsUrl(SPEECH_SERVICES_WS_VAD_URL));
      socket.onopen = () => {
        console.log("WebSocket connected");
        setVadStatus("connected");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("VAD Response:", data);
          setVadStatus(data.status);
          setLastMessage(data.message);
        } catch (e) {
          console.log("Non-JSON message:", event.data);
          setLastMessage(event.data);
        }
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setVadStatus("error");
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected");
        setVadStatus("disconnected");
      };

      // Handle audio data from worklet and sending via websocket as bytes
      workletNode.port.onmessage = (event: MessageEvent) => {
        if (event.data.type === 'audioData' && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data.data);
        }
      };

      // Handle audio data from worklet and sending via websocket as base64
      // workletNode.port.onmessage = (event: MessageEvent) => {
      //   if (event.data.type === 'audioData' && socket.readyState === WebSocket.OPEN) {
      //     // Convert ArrayBuffer to base64
      //     const uint8Array = new Uint8Array(event.data.data);
      //     const base64Audio = btoa(String.fromCharCode(...uint8Array));

      //     socket.send(JSON.stringify({
      //       type: 'audio',
      //       data: base64Audio
      //     }));
      //   }
      // };

      // Connect the audio graph
      micSource.connect(workletNode);

      // Store references
      socketRef.current = socket;
      audioContextRef.current = audioContext;
      micStreamRef.current = micSource;
      workletNodeRef.current = workletNode;

      setIsStreaming(true);

      // Clean up blob URL
      URL.revokeObjectURL(blobURL);

    } catch (error) {
      console.error("Error starting stream:", error);
      setVadStatus("error");
    }
  };

  const stopStreaming = () => {
    try {
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }

      // Close audio context only if it's running
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Close WebSocket if still open
      // if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }

      // Reset state
      setIsStreaming(false);
      setVadStatus("idle");
      setLastMessage("");

    } catch (error) {
      console.error("Error stopping stream:", error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopStreaming();
      }
    };
  }, [isStreaming]); // Add dependency array

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'speech': return 'bg-green-500';
      case 'silence': return 'bg-gray-400';
      case 'connected': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <div className="mb-4">
        <button
          onClick={isStreaming ? stopStreaming : startStreaming}
          className={`px-6 py-3 rounded-lg font-semibold text-white ${isStreaming
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-blue-500 hover:bg-blue-600'
            }`}
        >
          {isStreaming ? "Stop Mic" : "Start Mic"}
        </button>
      </div>

      <div className={`p-4 rounded-lg border-2 ${getStatusColor(vadStatus)} bg-opacity-20`}>
        <div className="flex items-center mb-2">
          <div className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(vadStatus)}`}></div>
          <span className="font-semibold">Status: {vadStatus}</span>
        </div>
        {lastMessage && (
          <div className="text-sm text-gray-600">
            {lastMessage}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <div>🔊 Green: Speech detected</div>
        <div>🔇 Gray: Silence</div>
        <div>🔵 Blue: Connected</div>
        <div>🔴 Red: Error</div>
      </div>
    </div>
  );
}