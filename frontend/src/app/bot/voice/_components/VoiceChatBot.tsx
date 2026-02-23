"use client";

import { BotLoadingScreen } from "@/components/BotLoadingScreen";
import ChatBotTitleBar from "@/components/ChatBotTitleBar";
import ChatWindow from "@/components/ChatWindow";
import { ChatMessage } from "@/types/chat-message";
import React, { useState, useRef, useEffect, useCallback } from "react";
import VoiceBotChatActionBar from "./VoiceBotChatActionBar";
import { useRouter, useSearchParams } from "next/navigation";

export default function VoiceChatBot() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isBotTyping, setIsBotTyping] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isStartingNewChat, setIsStartingNewChat] = useState(false);

    const threadId = useRef<string>("");

    // Initialize conversation ID and load history
    const initializeConversation = useCallback(async () => {
        const existingId = searchParams.get("threadId");

        if (existingId) {
            // Use existing ID from URL and load its history
            threadId.current = existingId;
        } else {
            // Generate new ID and update URL (no history to load)
            const newId = crypto.randomUUID?.() ||
                Math.random().toString(36).substring(2, 15);
            threadId.current = newId;

            // Update URL without causing a page reload
            const params = new URLSearchParams(searchParams.toString());
            params.set("threadId", newId);
            router.replace(`?${params.toString()}`, { scroll: false });

            // New conversation starts with empty messages
            setMessages([]);
        }

        setIsInitialized(true);
    }, [searchParams, router]);

    // Start a new chat
    const startNewChat = useCallback(async () => {
        setIsStartingNewChat(true);

        try {
            // Generate new conversation ID
            const newId = crypto.randomUUID?.() ||
                Math.random().toString(36).substring(2, 15);

            // Update conversation ID
            threadId.current = newId;

            // Clear messages immediately for instant feedback
            setMessages([]);

            // Update URL
            const params = new URLSearchParams();
            params.set("conversationId", newId);
            router.replace(`?${params.toString()}`, { scroll: false });

            console.log(`Started new conversation: ${newId}`);
        } catch (error) {
            console.error('Error starting new chat:', error);
            // If there's an error, we already cleared messages, so user gets a fresh start anyway
        } finally {
            setIsStartingNewChat(false);
        }
    }, [router]);

    useEffect(() => {
        if (!threadId.current) {
            initializeConversation();
        }
    }, [initializeConversation]);

    if (!isInitialized) {
        return <BotLoadingScreen />;
    }

    if (!threadId.current) {
        return <BotLoadingScreen />;
    }

    return (
        <div className="fixed inset-0 flex flex-col bg-gray-50 dark:bg-gray-900">
            <ChatBotTitleBar title="Friday - AI Voice Bot" subtitle="Voice & Speech Support (STT + TTS + VAD)" onNewChat={startNewChat} isStartingNewChat={isStartingNewChat} isBotTyping={isBotTyping} />
            <ChatWindow messages={messages} botName="Friday" chatWindowPlaceholder="Enable voice mode and start speaking!" isBotTyping={isBotTyping} />
            <VoiceBotChatActionBar threadId={threadId} setMessages={setMessages} setIsBotTyping={setIsBotTyping} isBotTyping={isBotTyping} inputPlaceholder="Enable voice mode and speak to test voice & speech support..." messages={messages} />
        </div>
    );
};