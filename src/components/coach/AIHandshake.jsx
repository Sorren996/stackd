import { motion } from "framer-motion";
import { Leaf, Heart, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

const AI_HANDSHAKE_KEY = "ai_coach_handshake_accepted";

export function hasAcceptedAIHandshake() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AI_HANDSHAKE_KEY) === "true";
}

export function acceptAIHandshake() {
  if (typeof window === "undefined") return;
  localStorage.setItem(AI_HANDSHAKE_KEY, "true");
  localStorage.setItem("ai_coach_last_visit", Date.now().toString());
}

export default function AIHandshake({ onAccept }) {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="w-full max-w-md"
      >
        {/* Leaf emblem */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 300, damping: 20 }}
          className="mb-6 flex justify-center"
        >
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(91,168,138,0.25) 0%, rgba(91,163,184,0.08) 60%, transparent 100%)",
            }}
          >
            <Leaf className="h-9 w-9 text-teal-300/90" />
          </div>
        </motion.div>

        <h1 className="text-center text-2xl font-bold text-white">Welcome to your Wellness Coach</h1>
        <p className="mt-2 text-center text-sm text-white/55">
          I'm here to be your companion — learning your rhythms and helping you discover the patterns that make your days feel steady.
        </p>

        {/* Principles */}
        <div className="mt-8 space-y-3">
          {[
            {
              icon: Heart,
              title: "I am your partner, not your doctor",
              body: "I offer insights based on your logs to help you understand your body's flow. I don't provide medical advice or dosing recommendations.",
            },
            {
              icon: ShieldCheck,
              title: "Your safety is my priority",
              body: "If you ever feel unwell or are experiencing an emergency, please connect with your healthcare team or call 911 immediately.",
            },
            {
              icon: Sparkles,
              title: "We're in this together",
              body: "Let's focus on gentle progress — discovering what makes your days feel balanced, and finding the rhythm that works best for you.",
            },
          ].map(({ icon: Icon, title, body }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + index * 0.1 }}
              className="flex gap-3 rounded-2xl border p-4"
              style={{
                background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))",
                borderColor: "rgba(255,255,255,0.12)",
              }}
            >
              <div className="mt-0.5 shrink-0">
                <Icon className="h-5 w-5 text-teal-300/80" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/90">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/50">{body}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Accept button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          type="button"
          onClick={onAccept}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition active:scale-[0.98]"
          style={{
            background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
            boxShadow: "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)",
          }}
        >
          Continue together
          <ArrowRight className="h-4 w-4" />
        </motion.button>

        <p className="mt-4 text-center text-[10px] text-white/30">
          By continuing, you agree to explore your wellness journey with the Coach under these guidelines.
        </p>
      </motion.div>
    </div>
  );
}