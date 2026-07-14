import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Leaf } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export default function CoachGateway() {
  const navigate = useNavigate();
  const prefersReducedMotion = usePrefersReducedMotion();

  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => base44.entities.UserSettings.list("-created_date", 1),
    staleTime: 60 * 1000
  });

  const notificationsEnabled = settings?.[0]?.coach_insight_notifications_enabled !== false;

  const { data: unreadInsights = [] } = useQuery({
    queryKey: ["unread-coach-insights"],
    queryFn: () => base44.entities.CoachInsight.filter({ status: "unread" }, "-generated_at", 10),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: notificationsEnabled
  });

  const hasUnread =
  notificationsEnabled &&
  (unreadInsights || []).some(
    (insight) => !insight.expires_at || new Date(insight.expires_at).getTime() > Date.now()
  );

  const ariaLabel = hasUnread ?
  "AI Wellness Coach. New insight available." :
  "AI Wellness Coach. No new insights.";

  const breathDuration = 4;
  const breathScale = prefersReducedMotion ? 1 : [1, 1.12, 1];
  const glowOpacity = prefersReducedMotion ? 0.5 : [0.3, 0.65, 0.3];

  return (
    <div className="pointer-events-none absolute right-3 top-2 z-30">
      <motion.button
        type="button"
        onClick={() => navigate("/coach")}
        whileTap={{ scale: 0.9 }}
        aria-label={ariaLabel}
        className="pointer-events-auto relative flex items-center justify-center rounded-full border backdrop-blur-sm transition my-10 mx-8 h-8 w-8"
        style={{
          background: hasUnread ?
          "linear-gradient(145deg, rgba(251,191,36,0.15), rgba(251,191,36,0.04))" :
          "linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
          borderColor: hasUnread ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.18)",
          boxShadow: hasUnread ?
          "0 4px 20px rgba(251,191,36,0.2), inset 0 1px 1px rgba(255,255,255,0.2)" :
          "0 4px 14px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.14)"
        }}>
        
        {hasUnread &&
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-2 rounded-full"
          animate={{ opacity: glowOpacity }}
          transition={
          prefersReducedMotion ?
          {} :
          { duration: breathDuration, repeat: Infinity, ease: "easeInOut" }
          }
          style={{
            background: "radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)"
          }} />

        }
        <motion.span
          animate={hasUnread ? { scale: breathScale } : { scale: 1 }}
          transition={
          hasUnread && !prefersReducedMotion ?
          { duration: breathDuration, repeat: Infinity, ease: "easeInOut" } :
          {}
          }
          className="relative z-10">
          
          <Leaf
            className="h-5 w-5"
            style={{ color: hasUnread ? "rgba(251,191,36,0.95)" : "rgba(255,255,255,0.6)" }} />
          
        </motion.span>
      </motion.button>
    </div>);

}