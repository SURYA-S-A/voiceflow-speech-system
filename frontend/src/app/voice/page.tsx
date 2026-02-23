"use client";

import { getHttpUrl, getWsUrl } from "@/utils/urlUtils";
import { useEffect, useRef, useState } from "react";

export default function HomePage() {

    const SPEECH_SERVICES_HTTP_TTS_URL = process.env.NEXT_PUBLIC_SPEECH_SERVICES_HTTP_TTS_URL as string;
    const SPEECH_SERVICES_WS_STT_URL = process.env.NEXT_PUBLIC_SPEECH_SERVICES_WS_STT_URL as string;

    const ws = useRef<WebSocket | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState<string>("");

    const mediaStream = useRef<MediaStream | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const workletNode = useRef<AudioWorkletNode | null>(null);

    const connectWebSocket = () => {
        ws.current = new WebSocket(getWsUrl(SPEECH_SERVICES_WS_STT_URL));
        ws.current.onopen = () => console.log("🔌 WebSocket connected");

        ws.current.onerror = (err) => console.error("WebSocket Error:", err);

        ws.current.onmessage = (event) => {
            setTranscript(event.data);
        };
    };

    const startRecording = async () => {
        if (isRecording) return;

        connectWebSocket();

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

        audioContext.current = new AudioContext();

        // Define AudioWorkletProcessor inline
        const processorCode = `
      class PCMProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0];
          if (input && input[0]) {
            this.port.postMessage(input[0]);
          }
          return true;
        }
      }
      registerProcessor("pcm-processor", PCMProcessor);
    `;
        const blob = new Blob([processorCode], { type: "application/javascript" });
        const moduleURL = URL.createObjectURL(blob);
        await audioContext.current.audioWorklet.addModule(moduleURL);

        const source = audioContext.current.createMediaStreamSource(
            mediaStream.current
        );

        workletNode.current = new AudioWorkletNode(audioContext.current, "pcm-processor");

        workletNode.current.port.onmessage = (e) => {
            const floatData = e.data as Float32Array;
            const pcm = floatTo16BitPCM(floatData, audioContext.current!.sampleRate, 16000);

            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(pcm);
            }
        };

        source.connect(workletNode.current);
        workletNode.current.connect(audioContext.current.destination);

        setIsRecording(true);
    };


    const stopRecording = () => {
        if (!isRecording) return;

        workletNode.current?.disconnect();
        audioContext.current?.close();
        mediaStream.current?.getTracks().forEach((track) => track.stop());
        ws.current?.close();

        setIsRecording(false);
    };

    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, []);

    const downsampleBuffer = (
        buffer: Float32Array,
        inputSampleRate: number,
        outputSampleRate: number
    ) => {
        if (inputSampleRate === outputSampleRate) return buffer;

        const sampleRateRatio = inputSampleRate / outputSampleRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Float32Array(newLength);

        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            let accum = 0,
                count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = accum / count;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }

        return result;
    };

    const floatTo16BitPCM = (
        input: Float32Array,
        inputSampleRate: number,
        outputSampleRate: number
    ) => {
        const downsampled = downsampleBuffer(input, inputSampleRate, outputSampleRate);
        const output = new Int16Array(downsampled.length);
        for (let i = 0; i < downsampled.length; i++) {
            // let s = Math.max(-1, Math.min(1, downsampled[i])); // Resolving build error by replacing with const
            const s = Math.max(-1, Math.min(1, downsampled[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        return output.buffer;
    };


    const handleSpeak = async () => {
        if (!transcript.trim()) return;

        try {
            const res = await fetch(getHttpUrl(SPEECH_SERVICES_HTTP_TTS_URL), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: transcript }),
            });

            const audioData = await res.arrayBuffer();

            // Create a new AudioContext if it doesn't exist or is closed
            let context = audioContext.current;
            if (!context || context.state === 'closed') {
                context = new AudioContext();
                audioContext.current = context;
            }

            // Resume context if suspended
            if (context.state === 'suspended') {
                await context.resume();
            }

            const decoded = await context.decodeAudioData(audioData);
            const source = context.createBufferSource();
            source.buffer = decoded;
            source.connect(context.destination);
            source.start();
        } catch (err) {
            console.error("TTS playback failed:", err);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-900 text-white px-4">
            <div className="bg-gray-800 rounded-2xl shadow-lg p-8 max-w-xl w-full text-center space-y-6">
                <h1 className="text-2xl font-bold">🎙️ Real-time Transcription</h1>

                <div className="border border-gray-600 rounded-lg p-4 min-h-[100px] text-left bg-gray-900 space-y-4">
                    {transcript ? (
                        <>
                            <p className="whitespace-pre-wrap">{transcript}</p>

                        </>
                    ) : (
                        <p className="text-gray-500 italic">Speak something...</p>
                    )}
                </div>

                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${isRecording
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-green-600 hover:bg-green-700"
                        }`}
                >
                    {isRecording ? "🛑 Stop Recording" : "🎤 Start Recording"}
                </button>
                <button
                    onClick={handleSpeak}
                    className="px-6 py-3 rounded-xl font-semibold transition-all bg-orange-600 hover:bg-orange-700"
                >
                    🔊 Speak
                </button>
            </div>
        </main>
    );
}
