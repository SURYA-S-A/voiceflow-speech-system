import { ChatMessage } from "@/types/chat-message";
import { formatTime } from "@/utils/dateUtils";
import { motion } from "framer-motion";
import { Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const MessageBubble = ({ message, botName }: { message: ChatMessage, botName: string }) => {
  const isUser = message.sender === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start max-w-[85%] sm:max-w-[75%] md:max-w-[65%]`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? `bg-primary ml-2` : 'bg-gray-500 mr-2'
          }`}>
          {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
        </div>
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0 flex-1`}>
          <div className="text-xs mb-1.5 text-gray-400 dark:text-gray-500 font-medium">
            <span className="opacity-80">
              {isUser ? 'You' : botName}
            </span>
            <span className="mx-1 opacity-60">•</span>
            <span className="opacity-70">
              {formatTime(message.timestamp)}
            </span>
          </div>
          <div
            className={`p-3 text-base rounded-lg break-words min-w-0 ${isUser
              ? 'bg-primary text-white rounded-br-none inline-block'
              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100 rounded-bl-none w-full'
              }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2 -mx-1">
                    <table className="w-full border-collapse border border-gray-500 text-left text-sm min-w-[500px]">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-gray-500 bg-gray-700 px-3 py-2 text-white text-sm font-medium">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-gray-500 px-3 py-2 text-sm whitespace-nowrap">
                    {children}
                  </td>
                ),
                p: ({ children }) => <p className="mb-2 last:mb-0 break-words leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="break-words leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children, className }) => {
                  const isInline = !className?.includes('language-');
                  if (isInline) {
                    return (
                      <code className="bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded text-sm break-all font-mono">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <div className="overflow-x-auto my-3 -mx-1">
                      <pre className="bg-gray-200 dark:bg-gray-600 p-3 rounded text-sm whitespace-pre-wrap font-mono">
                        <code>{children}</code>
                      </pre>
                    </div>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-400 pl-4 italic my-2 break-words">
                    {children}
                  </blockquote>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    className="text-blue-500 hover:text-blue-600 underline break-all"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {message.text}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </motion.div>
  );
};