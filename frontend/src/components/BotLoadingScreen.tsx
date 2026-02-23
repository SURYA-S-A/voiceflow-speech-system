import { Bot } from "lucide-react";

export const BotLoadingScreen = () => {
  return (
    <div className="flex flex-col justify-center items-center h-screen text-gray-500">
      <div className="flex items-center space-x-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center bg-primary">
          <Bot size={24} className="text-white animate-bounce" />
        </div>
        <span className="text-lg font-medium">Bringing your bot online...</span>
      </div>

      <div className="flex space-x-1 mt-2">
        <span className="animate-[fadeIn_1s_ease-in-out_infinite]">●</span>
        <span className="animate-[fadeIn_1s_ease-in-out_infinite] delay-100">●</span>
        <span className="animate-[fadeIn_1s_ease-in-out_infinite] delay-200">●</span>
      </div>
    </div>
  );
};