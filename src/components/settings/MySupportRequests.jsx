import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { LifeBuoy, Bug, MessageSquare, ChevronDown, ChevronUp, Loader2, CheckCircle2, Clock, CircleDot } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const TICKET_TYPE_META = {
  support: { icon: LifeBuoy, label: "Support", color: "#5b6550" },
  bug: { icon: Bug, label: "Bug", color: "#c97060" },
  feedback: { icon: MessageSquare, label: "Feedback", color: "#af751b" },
};

const STATUS_META = {
  open: {
    label: "Received",
    icon: CircleDot,
    style: { background: "rgba(91,101,80,0.12)", color: "#5b6550", border: "1px solid rgba(91,101,80,0.25)" },
    blurb: "We've received your message and will be with you soon.",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    style: { background: "rgba(175,117,27,0.12)", color: "#af751b", border: "1px solid rgba(175,117,27,0.25)" },
    blurb: "We're looking into this for you.",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    style: { background: "rgba(91,101,80,0.12)", color: "#5b6550", border: "1px solid rgba(91,101,80,0.25)" },
    blurb: "We've addressed this — check the response below.",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle2,
    style: { background: "rgba(63,56,48,0.06)", color: "#8a7f70", border: "1px solid #eadccf" },
    blurb: "This conversation has been closed.",
  },
};

export default function MySupportRequests() {
  const [expandedId, setExpandedId] = useState(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: () => base44.entities.SupportTicket.list("-created_date", 50),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-white/30" />
      </div>
    );
  }

  if (!tickets.length) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Your Requests</h3>
      <div className="space-y-2.5">
        {tickets.map((ticket) => {
          const typeMeta = TICKET_TYPE_META[ticket.ticket_type] || TICKET_TYPE_META.support;
          const statusMeta = STATUS_META[ticket.status] || STATUS_META.open;
          const TypeIcon = typeMeta.icon;
          const StatusIcon = statusMeta.icon;
          const isExpanded = expandedId === ticket.id;
          const hasResponse = ticket.admin_response && ticket.admin_response.trim().length > 0;

          return (
            <div
              key={ticket.id}
              className="glass-card rounded-3xl border overflow-hidden"
              style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                className="w-full flex items-start gap-3 p-4 text-left transition hover:bg-white/[0.02]"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border"
                  style={{ borderColor: "#eadccf", background: "#f7f1e8" }}
                >
                  <TypeIcon className="h-4 w-4" style={{ color: typeMeta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{typeMeta.label}</span>
                    <span
                      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                      style={statusMeta.style}
                    >
                      <StatusIcon className="h-2.5 w-2.5" />
                      {statusMeta.label}
                    </span>
                    {hasResponse && (
                      <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: "#5b6550", opacity: 0.8 }}>
                        <MessageSquare className="h-2.5 w-2.5" />
                        Reply
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-white/50 line-clamp-1">{ticket.message}</p>
                  <p className="mt-1 text-[10px] text-white/30">
                    {format(new Date(ticket.created_date), "MMM d · h:mm a")}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-white/30 shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-white/30 shrink-0 mt-1" />
                )}
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t"
                    style={{ borderColor: "#eadccf" }}
                  >
                    <div className="px-4 py-4 space-y-3" style={{ background: "#f7f1e8" }}>
                      <div
                        className="flex items-start gap-2 rounded-2xl border px-3 py-2.5"
                        style={{ borderColor: "#eadccf", background: "#fdf9f2" }}
                      >
                        <StatusIcon className="h-3.5 w-3.5 text-white/40 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-white/55 leading-relaxed">{statusMeta.blurb}</p>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1">Your message</p>
                        <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
                      </div>

                      {hasResponse && (
                        <div
                          className="rounded-2xl border p-3.5"
                          style={{ borderColor: "rgba(91,101,80,0.20)", background: "rgba(91,101,80,0.06)" }}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#5b6550", opacity: 0.7 }}>
                            Reply from support
                          </p>
                          <p className="text-sm text-white/85 whitespace-pre-wrap leading-relaxed">{ticket.admin_response}</p>
                          {ticket.resolved_at && (
                            <p className="mt-2 text-[10px] text-white/35">
                              {format(new Date(ticket.resolved_at), "MMM d · h:mm a")}
                            </p>
                          )}
                        </div>
                      )}

                      {!hasResponse && ticket.status === "open" && (
                        <p className="text-[11px] text-white/35 leading-relaxed">
                          We'll respond here as soon as we can. Thank you for your patience.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}