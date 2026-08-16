import clsx from "clsx";
import type { ChatMessage } from "@/src/lib/agents/orchestrator";

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "tool" || message.role === "system") return null;

  const isUser = message.role === "user";
  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap",
          isUser
            ? "bg-brand-600 text-white rounded-br-sm"
            : "bg-white text-slate-900 border border-slate-200 rounded-bl-sm",
        )}
      >
        {message.content}
      </div>
    </div>
  );
}
