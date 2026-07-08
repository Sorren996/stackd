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
    <div className="pointer-events-none absolute right-3 top-2 z-30">
      <motion.button
        type="button"
        onClick={() => navigate("/coach")}
        whileTap={{ scale: 0.9 }}
        aria-label="Open Wellness Coach"
        className="pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-sm transition"
        style={{
          background: glowing
            ? "linear-gradient(145deg, rgba(251,191,36,0.15), rgba(251,191,36,0.04))"
            : "linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
          borderColor: glowing ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.18)",
          boxShadow: glowing
            ? "0 4px 20px rgba(251,191,36,0.2), inset 0 1px 1px rgba(255,255,255,0.2)"
            : "0 4px 14px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.14)",
        }}
      >
        {glowing && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 rounded-full"
            animate={{ opacity: [0.3, 0.65, 0.3] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background: "radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)",
            }}
          />
        )}
        <motion.span
          animate={glowing ? { scale: [1, 1.12, 1] } : { scale: 1 }}
          transition={glowing ? { duration: 2.5, repeat: Infinity, ease: "easeInOut" } : {}}
          className="relative z-10"
        >
          <Leaf
            className="h-5 w-5"
            style={{ color: glowing ? "rgba(251,191,36,0.95)" : "rgba(255,255,255,0.6)" }}
          />
        </motion.span>
      </motion.button>
    </div>
  );
}