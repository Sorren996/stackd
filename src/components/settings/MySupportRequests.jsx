import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { LifeBuoy, Bug, MessageSquare, ChevronDown, ChevronUp, Loader2, CheckCircle2, Clock, CircleDot } from "lucide-react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import SectionCard from "@/components/editorial/SectionCard";

const TICKET_TYPE_META = {
  support: { icon: LifeBuoy, label: "Support", color: "#5b6550" },
  bug: { icon: Bug, label: "Bug", color: "#c97060" },
  feedback: { icon: MessageSquare, label: "Feedback", color: "#af751b" },
};

const STATUS_META = {
  open: {
    label: "Received",
    icon: CircleDot,
    color: "#5b6550",
    blurb: "We've received your message and will be with you soon.",
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    color: "#af751b",
    blurb: "We're looking into this for you.",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    color: "#5b6550",
    blurb: "We've addressed this — check the response below.",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle2,
    color: "#8a7f70",
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
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#746959" }} />
      </div>
    );
  }

  if (!tickets.length) return null;

  return (
    <SectionCard label="Your Requests">
      <div>
        {tickets.map((ticket) => {
          const typeMeta = TICKET_TYPE_META[ticket.ticket_type] || TICKET_TYPE_META.support;
          const statusMeta = STATUS_META[ticket.status] || STATUS_META.open;
          const TypeIcon = typeMeta.icon;
          const StatusIcon = statusMeta.icon;
          const isExpanded = expandedId === ticket.id;
          const hasResponse = ticket.admin_response && ticket.admin_response.trim().length > 0;

          return (
            <div key={ticket.id}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : ticket.id)}
                className="flex w-full items-baseline gap-2 py-2.5 text-left transition hover:opacity-70"
              >
                <span className="shrink-0 text-sm font-medium" style={{ color: "#3f3830" }}>
                  {typeMeta.label}
                </span>
                <span className="flex-1 overflow-hidden">
                  <span className="dotted-leader block" />
                </span>
                <span className="shrink-0 text-xs font-semibold" style={{ color: statusMeta.color }}>
                  {statusMeta.label}
                </span>
                {hasResponse && (
                  <span className="shrink-0 text-[10px] font-medium" style={{ color: "#5b6550" }}>
                    Reply
                  </span>
                )}
                <span className="shrink-0">
                  {isExpanded ? <ChevronUp className="h-4 w-4" style={{ color: "#746959" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "#746959" }} />}
                </span>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-4 space-y-3">
                      <p className="text-[10px]" style={{ color: "#746959" }}>
                        {format(new Date(ticket.created_date), "MMM d, h:mm a")}
                      </p>

                      <div className="flex items-start gap-2">
                        <StatusIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: statusMeta.color, opacity: 0.6 }} />
                        <p className="text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>{statusMeta.blurb}</p>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#746959" }}>Your message</p>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#3f3830" }}>{ticket.message}</p>
                      </div>

                      {hasResponse && (
                        <div className="rounded-2xl border p-3.5" style={{ borderColor: "rgba(91,101,80,0.20)", background: "rgba(91,101,80,0.06)" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#5b6550", opacity: 0.7 }}>
                            Reply from support
                          </p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#3f3830" }}>{ticket.admin_response}</p>
                          {ticket.resolved_at && (
                            <p className="mt-2 text-[10px]" style={{ color: "#746959" }}>
                              {format(new Date(ticket.resolved_at), "MMM d, h:mm a")}
                            </p>
                          )}
                        </div>
                      )}

                      {!hasResponse && ticket.status === "open" && (
                        <p className="text-[11px] leading-relaxed" style={{ color: "#746959" }}>
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
    </SectionCard>
  );
}