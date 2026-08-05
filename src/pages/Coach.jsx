import { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Leaf, BookOpen, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AIHandshake, { hasAcceptedAIHandshake, acceptAIHandshake } from "@/components/coach/AIHandshake";
import MessageBubble from "@/components/coach/MessageBubble";
import InsightMessage from "@/components/coach/InsightMessage";
import TypingIndicator from "@/components/coach/TypingIndicator";
import { consumeSurfaceInsight, onSurfaceInsight } from "@/lib/coachInsightSurface";
import { selectSurfaceableInsights } from "@/lib/insightGating";

const AGENT_NAME = "coach";
const LAST_VISIT_KEY = "ai_coach_last_visit";

export default function Coach() {
  const [handshakeAccepted, setHandshakeAccepted] = useState(hasAcceptedAIHandshake());
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [surfacedInsights, setSurfacedInsights] = useState([]);
  const messagesEndRef = useRef(null);
  const initialScrollDone = useRef(false);
  const scrollContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingSafetyRef = useRef(null);
  const surfaceRequestRef = useRef(null);
  const queryClient = useQueryClient();

  const beginTyping = () => {
    setIsTyping(true);
    if (typingSafetyRef.current) clearTimeout(typingSafetyRef.current);
    typingSafetyRef.current = setTimeout(() => setIsTyping(false), 45000);
  };

  const endTypingDebounced = (messages) => {
    const last = messages?.[messages.length - 1];
    if (last?.role !== "assistant") return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1500);
  };

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (typingSafetyRef.current) clearTimeout(typingSafetyRef.current);
  }, []);

  const { data: unreadInsights = [] } = useQuery({
    queryKey: ["unread-coach-insights"],
    queryFn: () => base44.entities.CoachInsight.filter({ status: "unread" }, "-generated_at", 10),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Apply the surfacing gate (max 2/day, ≥8h apart) so only a few selective,
  // well-spaced insights ever appear in the chat — never a flood on reopen.
  const validUnreadInsights = selectSurfaceableInsights(unreadInsights || []);
  const newestInsight = validUnreadInsights[0] || null;

  // Track insights shown in the chat. Unread ones render at the bottom of the
  // conversation; when acknowledged they lock into the flow at that position so
  // new messages generate underneath them.
  useEffect(() => {
    if (!newestInsight) return;
    setSurfacedInsights((prev) => {
      if (prev.some((s) => s.insight.id === newestInsight.id)) return prev;
      return [...prev, { insight: newestInsight, acknowledged: false, insertAfterIndex: null }];
    });
  }, [newestInsight]);

  // The logo glow persists until the user actually acknowledges the insight —
  // by talking about it, dismissing it, or tapping the glowing logo (which
  // surfaces it in chat).

  const neutralizeInsight = (insight) => {
    // Any interaction (talk about / dismiss) neutralizes the insight: it stays
    // visible in the flow but loses its amber highlight and action buttons,
    // and is dropped from the unread cache so the logo glow stops instantly.
    queryClient.setQueryData(["unread-coach-insights"], (old = []) =>
      (old || []).filter((i) => i.id !== insight.id)
    );
    setSurfacedInsights((prev) => {
      const exists = prev.some((s) => s.insight.id === insight.id);
      if (exists) {
        return prev.map((s) =>
          s.insight.id === insight.id
            ? { ...s, acknowledged: true, insertAfterIndex: s.insertAfterIndex ?? messages.length }
            : s
        );
      }
      return [...prev, { insight, acknowledged: true, insertAfterIndex: messages.length }];
    });
  };

  const handleDismissInsight = async (insight) => {
    neutralizeInsight(insight);
    try {
      await base44.entities.CoachInsight.update(insight.id, {
        status: "dismissed",
        dismissed_at: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["unread-coach-insights"] });
    } catch {
      // Neutral state already applied optimistically
    }
  };

  const handleTalkAboutInsight = (insight) => {
    neutralizeInsight(insight);
    const message = `Let's talk about this observation — ${insight.title}: ${insight.summary || insight.message}`;
    handleSend(message);
    base44.entities.CoachInsight.update(insight.id, {
      status: "read",
      read_at: new Date().toISOString(),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["unread-coach-insights"] }))
      .catch(() => {});
  };

  const handleSaveInsightToJournal = async (insight) => {
    try {
      await base44.entities.JournalEntry.create({
        content: `Coach insight: ${insight.title}\n\n${insight.summary}`,
        mood: "reflective",
        entry_date: new Date().toISOString(),
      });
      toast.success("Saved to journal");
    } catch {
      toast.error("Could not save to journal");
    }
  };

  // Surface a requested insight (from the glowing logo) as an in-chat message
  // rather than a card/modal. On mount we consume any pending request; while
  // kept-alive we listen for live requests.
  useEffect(() => {
    surfaceRequestRef.current = consumeSurfaceInsight();
    return onSurfaceInsight((id) => {
      surfaceRequestRef.current = id;
    });
  }, []);

  useEffect(() => {
    if (loadingConversations || !surfaceRequestRef.current) return;
    const id = surfaceRequestRef.current;
    const insight = validUnreadInsights.find((i) => i.id === id);
    if (!insight) return;
    surfaceRequestRef.current = null;
    // The insight is already rendered as a fully-loaded InsightMessage card
    // via the newestInsight effect — no AI streaming needed. Just mark it
    // as read so the logo glow settles, and scroll to make it visible.
    base44.entities.CoachInsight.update(insight.id, {
      status: "read",
      read_at: new Date().toISOString(),
    })
      .then(() => queryClient.invalidateQueries({ queryKey: ["unread-coach-insights"] }))
      .catch(() => {});
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
  }, [validUnreadInsights, loadingConversations]);

  useEffect(() => {
    if (!handshakeAccepted) return;
    loadConversations();
    localStorage.setItem(LAST_VISIT_KEY, Date.now().toString());
  }, [handshakeAccepted]);

  useEffect(() => {
    if (!activeConversationId) return;

    const unsubscribe = base44.agents.subscribeToConversation(activeConversationId, (data) => {
      setMessages(data.messages || []);
      endTypingDebounced(data.messages);
    });

    return () => unsubscribe();
  }, [activeConversationId]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (messages.length === 0 && surfacedInsights.length === 0) return;
    if (!initialScrollDone.current) {
      el.scrollTop = el.scrollHeight;
      initialScrollDone.current = true;
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, surfacedInsights]);

  const loadConversations = async () => {
    try {
      const result = await base44.agents.listConversations({ agent_name: AGENT_NAME });
      setConversations(result || []);
      if (result?.length > 0) {
        setActiveConversationId(result[0].id);
        setMessages(result[0].messages || []);
      }
    } catch {
      // First-time users may not have conversations yet
    } finally {
      setLoadingConversations(false);
    }
  };

  const handleAcceptHandshake = () => {
    acceptAIHandshake();
    setHandshakeAccepted(true);
  };

  const startNewConversation = async () => {
    try {
      const conversation = await base44.agents.createConversation({
        agent_name: AGENT_NAME,
        metadata: { name: "Wellness Chat", description: "Your reflective wellness journey" },
      });
      setActiveConversationId(conversation.id);
      setMessages([]);
      setConversations((prev) => [conversation, ...prev]);
    } catch {
      // Will fall back to sending first message which auto-creates
    }
  };

  const handleSend = async (overrideMessage) => {
    // Ignore non-string overrides — button onClick passes a MouseEvent which
    // would otherwise be coerced here and break .trim().
    const source = typeof overrideMessage === "string" ? overrideMessage : input;
    const trimmed = source.trim();
    if (!trimmed || isSending) return;

    setInput("");
    setIsSending(true);
    beginTyping();

    let conversationId = activeConversationId;
    let conversation = conversations.find((c) => c.id === conversationId);

    if (!conversationId) {
      try {
        conversation = await base44.agents.createConversation({
          agent_name: AGENT_NAME,
          metadata: { name: "Wellness Chat", description: "Your reflective wellness journey" },
        });
        conversationId = conversation.id;
        setActiveConversationId(conversationId);
        setConversations((prev) => [conversation, ...prev]);
      } catch {
        setIsSending(false);
        setIsTyping(false);
        return;
      }
    }

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

    try {
      await base44.agents.addMessage(conversation, { role: "user", content: trimmed });
      setIsSending(false);
    } catch {
      setIsSending(false);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I had trouble receiving that — please try again in a moment." },
      ]);
    }
  };

  const handleJournalSubmit = async (content, mood) => {
    if (!content.trim()) return;

    try {
      await base44.entities.JournalEntry.create({
        content: content.trim(),
        mood: mood || "reflective",
        entry_date: new Date().toISOString(),
      });

      // Share the journal entry with the coach
      const journalMessage = `I journaled today — feeling ${mood || "reflective"}: ${content.trim()}`;
      setInput(journalMessage);
      setShowJournalModal(false);
      // Auto-send the journal
      setTimeout(() => handleSend(), 100);
    } catch {
      setShowJournalModal(false);
    }
  };

  const hasContent = messages.length > 0 || surfacedInsights.length > 0 || loadingConversations;

  const renderList = useMemo(() => {
    const acknowledged = surfacedInsights.filter((s) => s.acknowledged);
    const unread = surfacedInsights.filter((s) => !s.acknowledged);
    const byIndex = {};
    acknowledged.forEach((s) => {
      const idx = Math.min(s.insertAfterIndex ?? 0, messages.length);
      (byIndex[idx] = byIndex[idx] || []).push(s);
    });
    const list = [];
    (byIndex[0] || []).forEach((s) =>
      list.push({ kind: "insight", insight: s.insight, acknowledged: true })
    );
    for (let i = 0; i < messages.length; i++) {
      list.push({ kind: "message", message: messages[i] });
      (byIndex[i + 1] || []).forEach((s) =>
        list.push({ kind: "insight", insight: s.insight, acknowledged: true })
      );
    }
    unread.forEach((s) =>
      list.push({ kind: "insight", insight: s.insight, acknowledged: false })
    );
    return list;
  }, [messages, surfacedInsights]);

  if (!handshakeAccepted) {
    return <AIHandshake onAccept={handleAcceptHandshake} />;
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden pb-28">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle, rgba(91,168,138,0.2) 0%, rgba(91,163,184,0.06) 70%, transparent 100%)" }}
          >
            <Leaf className="h-4 w-4 text-teal-300/80" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Wellness Coach</p>
            <p className="text-[10px] text-white/40">Your reflective companion</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowJournalModal(true)}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:text-white"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
            borderColor: "rgba(255,255,255,0.12)",
          }}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Journal
        </button>
      </div>

      {/* Emergency footer link */}
      <div className="shrink-0 px-5 pb-1">
        <p className="text-center text-[9px] text-white/25">
          For emergencies, please call 911. This is not a medical service.
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className={`min-h-0 flex-1 overflow-y-auto px-5 flex flex-col ${hasContent ? "justify-end" : "justify-center"}`}
        style={{ scrollbarWidth: "none" }}
      >
        <div className="space-y-4 py-4">
          {messages.length === 0 && surfacedInsights.length === 0 && !loadingConversations && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-16 text-center"
            >
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
                style={{ background: "radial-gradient(circle, rgba(91,168,138,0.15) 0%, transparent 70%)" }}
              >
                <Leaf className="h-7 w-7 text-teal-300/70" />
              </div>
              <p className="max-w-[260px] text-sm text-white/55">
                I'm here to listen and reflect alongside you. Share what's on your mind, or ask me about your recent rhythms.
              </p>
            </motion.div>
          )}
          {renderList.map((item, idx) =>
            item.kind === "message" ? (
              <MessageBubble key={`m-${idx}`} message={item.message} />
            ) : (
              <InsightMessage
                key={`i-${item.insight.id}`}
                insight={item.insight}
                acknowledged={item.acknowledged}
                onTalkAbout={handleTalkAboutInsight}
                onDismiss={handleDismissInsight}
              />
            )
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 pt-2">
        <AnimatePresence>
          {isTyping && <TypingIndicator />}
        </AnimatePresence>
        <div
          className="flex w-full items-end gap-2 rounded-2xl border p-3"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
            borderColor: "rgba(255,255,255,0.12)",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Share what's on your mind..."
            rows={1}
            className="min-h-[24px] max-h-32 flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || isSending}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition disabled:opacity-30"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
              boxShadow: "0 4px 14px rgba(91,163,184,0.2), inset 0 1px 1px rgba(255,255,255,0.2)",
            }}
          >
            <Send className="h-4 w-4 text-white" />
          </motion.button>
        </div>
      </div>

      {/* Journal modal */}
      <AnimatePresence>
        {showJournalModal && (
          <JournalModal onClose={() => setShowJournalModal(false)} onSubmit={handleJournalSubmit} />
        )}
      </AnimatePresence>
    </div>
  );
}

const MOODS = [
  { value: "calm", label: "Calm", emoji: "🌿" },
  { value: "steady", label: "Steady", emoji: "🪨" },
  { value: "tired", label: "Tired", emoji: "🌙" },
  { value: "stressed", label: "Stressed", emoji: "💨" },
  { value: "motivated", label: "Motivated", emoji: "✨" },
  { value: "reflective", label: "Reflective", emoji: "🤔" },
];

function JournalModal({ onClose, onSubmit }) {
  const [content, setContent] = useState("");
  const [mood, setMood] = useState("reflective");

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl border p-5 sm:rounded-3xl"
        style={{
          background: "linear-gradient(165deg, hsl(162,12%,9%), hsl(162,10%,6%))",
          borderColor: "rgba(255,255,255,0.14)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)",
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Daily Reflection</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border text-white/60"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mood selector */}
        <div className="mb-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">How are you feeling?</p>
          <div className="grid grid-cols-3 gap-2">
            {MOODS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setMood(option.value)}
                className={`rounded-xl border py-2.5 text-xs font-medium transition ${
                  mood === option.value ? "text-white" : "text-white/55 hover:text-white/75"
                }`}
                style={
                  mood === option.value
                    ? {
                        background: "linear-gradient(145deg, rgba(91,168,138,0.2), rgba(91,163,184,0.1))",
                        borderColor: "rgba(91,168,138,0.3)",
                      }
                    : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }
                }
              >
                <span className="mr-1">{option.emoji}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Journal text */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind today? How did your body feel? What felt steady, and what felt like a gentle challenge?"
          rows={5}
          className="w-full resize-none rounded-2xl border bg-black/25 p-3 text-sm text-white placeholder:text-white/35 focus:outline-none"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        />

        <button
          type="button"
          onClick={() => onSubmit(content, mood)}
          disabled={!content.trim()}
          className="mt-3 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
          style={{
            background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
            boxShadow: "0 6px 20px rgba(91,163,184,0.2), inset 0 1px 1px rgba(255,255,255,0.2)",
          }}
        >
          Share with Coach
        </button>
      </motion.div>
    </motion.div>
  );
}