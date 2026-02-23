import { ChatMessage } from "@/types/chat-message";
import { formatDate } from "./dateUtils";
import saveAs from "file-saver";

export const exportChatAsTXT = (messages: ChatMessage[], conversationId: string) => {
    const chatContent = messages
        .map((msg) => {
            const formattedTime = formatDate(msg.timestamp);
            if (msg.sender === "user") {
                return `---------------------------------------------------\nUser: ${formattedTime}  \nQuery: ${msg.text}  \n---------------------------------------------------`;
            } else {
                return `Bot: ${formattedTime}  \nResponse: ${msg.text}`;
            }
        })
        .join("\n");

    const blob = new Blob([chatContent], { type: "text/plain" });
    saveAs(blob, `chat_history_${conversationId}.txt`);
};