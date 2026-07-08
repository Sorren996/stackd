import ReactMarkdown from "react-markdown";
import { Leaf, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          background: isUser
            ? "linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))"
            : "radial-gradient(circle, rgba(91,168,138,0.2) 0%, rgba(91,163,184,0.06) 70%, transparent 100%)",
        }}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-white/60" />
        ) : (
          <Leaf className="h-3.5 w-3.5 text-teal-300/80" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
          isUser ? "rounded-tr-sm" : "rounded-tl-sm"
        }`}
        style={{
          background: isUser
            ? "linear-gradient(145deg, rgba(91,168,138,0.22), rgba(91,163,184,0.14))"
            : "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
          borderColor: isUser ? "rgba(91,168,138,0.25)" : "rgba(255,255,255,0.1)",
          border: "1px solid",
        }}
      >
        {message.content ? (
          isUser ? (
            <p className="whitespace-pre-wrap text-sm text-white/90">{message.content}</p>
          ) : (
            <ReactMarkdown className="prose prose-sm max-w-none text-sm text-white/90 [&>*]:first:mt-0 [&>*]:last:mb-0 [&_p]:leading-relaxed [&_strong]:text-white [&_em]:text-teal-200/80">
              {message.content}
            </ReactMarkdown>
          )
        ) : (
          <TypingIndicator />
        )}

        {/* Tool calls */}
        <AnimatePresence>
          {message.tool_calls?.map((toolCall, idx) => (
            <ToolCallDisplay key={idx} toolCall={toolCall} />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-teal-300/50"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

function ToolCallDisplay({ toolCall }) {
  const status = toolCall.status || "pending";
  const isFailed = ["failed", "error"].includes(status);

  const label =
    status === "pending" || status === "running" || status === "in_progress"
      ? "Observing..."
      : isFailed
        ? "Couldn't reach that"
        : "Noticed something";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mt-2 flex items-center gap-1.5 border-t border-white/10 pt-1.5"
    >
      <Leaf className={`h-3 w-3 ${isFailed ? "text-red-400/60" : "text-teal-300/50"}`} />
      <span className={`text-[10px] font-medium ${isFailed ? "text-red-400/60" : "text-white/40"}`}>
        {label}
      </span>
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className="text-[10px] text-teal-300/40"
      >
        {status === "pending" || status === "running" || status === "in_progress" ? "·" : ""}
      </motion.span>
    </motion.div>
  );
}