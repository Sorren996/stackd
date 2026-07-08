import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Leaf } from "lucide-react";
import { useNavigate } from "react-router-dom";

const LAST_VISIT_KEY = "ai_coach_last_visit";
const GLOW_RESET_MS = 30 * 60 * 1000; // 30 minutes before glow fades

function shouldGlow() {
  if (typeof window === "undefined") return false;
  const lastVisit = Number(localStorage.getItem(LAST_VISIT_KEY) || 0);
  return Date.now() - lastVisit > GLOW_RESET_MS;
}

export default function CoachGateway() {
  const navigate = useNavigate();
  const [glowing, setGlowing] = useState(shouldGlow);

  useEffect(() => {
    const check = () => setGlowing(shouldGlow());
    const interval = setInterval(check, 60 * 1000);
    window.addEventListener("storage", check);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", check);
    };
  }, []);

  return (
    <div className="flex justify-center pt-4 pb-2">
      <motion.button
        type="button"
        onClick={() => navigate("/coach")}
        whileTap={{ scale: 0.95 }}
        className="relative flex items-center gap-2.5 rounded-full border px-5 py-2.5 backdrop-blur-sm transition"
        style={{
          background: glowing
            ? "linear-gradient(145deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))"
            : "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          borderColor: glowing ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.14)",
          boxShadow: glowing
            ? "0 8px 28px rgba(251,191,36,0.15), inset 0 1px 1px rgba(255,255,255,0.18)"
            : "0 6px 20px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.12)",
        }}
      >
        {glowing && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-3 rounded-full"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background: "radial-gradient(circle, rgba(251,191,36,0.18) 0%, transparent 70%)",
            }}
          />
        )}
        <motion.span
          animate={glowing ? { scale: [1, 1.1, 1] } : { scale: 1 }}
          transition={glowing ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : {}}
          className="relative z-10"
        >
          <Leaf
            className="h-4 w-4"
            style={{ color: glowing ? "rgba(251,191,36,0.9)" : "rgba(255,255,255,0.5)" }}
          />
        </motion.span>
        <span
          className="relative z-10 text-sm font-semibold"
          style={{ color: glowing ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.7)" }}
        >
          {glowing ? "New reflections await" : "Your Wellness Coach"}
        </span>
      </motion.button>
    </div>
  );
}