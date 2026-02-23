import React, { useRef, useEffect } from "react";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatMessage } from "@/types/chat-message";
import { formatDateForChatWindow } from "@/utils/dateUtils";

interface ChatWindowProps {
  messages: ChatMessage[];
  botName: string;
  chatWindowPlaceholder: string;
  isBotTyping: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, botName, chatWindowPlaceholder, isBotTyping }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  let lastDate = "";

  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800 min-h-0">
      <div className="max-w-4xl mx-auto px-2 sm:px-4 md:px-6 pt-4 pb-4">
        {messages.length === 0 && (
          <div className="text-center mt-8 px-4 text-gray-500 dark:text-gray-400 text-base">
            {chatWindowPlaceholder}
          </div>
        )}
        {messages.map((msg, idx) => {
          const messageDate = formatDateForChatWindow(msg.timestamp);
          const showDateSeparator = messageDate !== lastDate;
          lastDate = messageDate;

          return (
            <React.Fragment key={idx}>
              {showDateSeparator && (
                <div className="text-center my-6">
                  <div className="inline-block bg-gray-200 dark:bg-gray-700 px-3 py-1 rounded-full text-xs text-gray-600 dark:text-gray-400 font-medium">
                    {messageDate}
                  </div>
                </div>
              )}
              <MessageBubble key={idx} message={msg} botName={botName} />
            </React.Fragment>
          );
        })}
        {isBotTyping && (
          <div className="flex items-center space-x-3 text-gray-500 dark:text-gray-400 px-2 py-3">
            <div className="flex space-x-1">
              <span className="animate-pulse w-2 h-2 bg-gray-400 rounded-full"></span>
              <span className="animate-pulse w-2 h-2 bg-gray-400 rounded-full delay-100"></span>
              <span className="animate-pulse w-2 h-2 bg-gray-400 rounded-full delay-200"></span>
            </div>
            <span className="text-sm font-medium">{botName} is typing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default ChatWindow;