import clsx from "clsx";
import type { StoredChatMessage } from "@/src/lib/agents/conversation";
import { ProcessDetails } from "./ProcessDetails";

export function MessageBubble({ message }: { message: StoredChatMessage }) {
  if (message.role === "tool" || message.role === "system") return null;

  const isUser = message.role === "user";
  return (
    <div className={clsx("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={clsx(
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md bg-brand-600 text-white"
            : "rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-xs",
        )}
      >
        {message.content}
      </div>
      {!isUser && message.trace && <ProcessDetails steps={message.trace} />}
    </div>
  );
}
