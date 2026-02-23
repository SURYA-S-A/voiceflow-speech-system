import { MessageSquarePlus, RefreshCw } from "lucide-react";
import { ThemeToggler } from "./theme/ThemeToggler";

interface ChatBotTitleBarProps {
  title: string;
  subtitle: string;
    onNewChat?: () => void;
  isStartingNewChat?: boolean;
  isBotTyping?: boolean;
}

const ChatBotTitleBar: React.FC<ChatBotTitleBarProps> = ({ title, subtitle, onNewChat, isStartingNewChat, isBotTyping }) => {

  return (
    <div className="bg-primary px-4 py-3 text-white flex items-center justify-between gap-4 shadow-md overflow-x-auto">
      <div className="flex flex-col min-w-0">
        <h2 className="text-base sm:text-lg font-semibold truncate">{title}</h2>
        <p className="text-xs sm:text-sm opacity-75 truncate">{subtitle}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onNewChat && (
          <button
            onClick={onNewChat}
            disabled={isStartingNewChat || isBotTyping}
            className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 disabled:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors duration-200"
          >
            {isStartingNewChat ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <MessageSquarePlus className="w-4 h-4" />
                New Chat
              </>
            )}
          </button>
        )}
        <ThemeToggler />
      </div>

    </div>
  );
};

export default ChatBotTitleBar;