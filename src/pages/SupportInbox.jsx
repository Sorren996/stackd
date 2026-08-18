import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { ChevronLeft, LifeBuoy, Bug, MessageSquare, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const TICKET_TYPE_META = {
  support: { icon: LifeBuoy, label: "Support", color: "text-teal-400" },
  bug: { icon: Bug, label: "Bug", color: "text-rose-400" },
  feedback: { icon: MessageSquare, label: "Feedback", color: "text-amber-400" },
};

const STATUS_META = {
  open: { label: "Open", className: "bg-teal-500/15 text-teal-300 border-teal-500/25" },
  in_progress: { label: "In Progress", className: "bg-amber-500/15 text-amber-300 border-amber-500/25" },
  resolved: { label: "Resolved", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" },
  closed: { label: "Closed", className: "bg-white/10 text-white/50 border-white/15" },
};

const STATUS_FLOW = ["open", "in_progress", "resolved", "closed"];

export default function SupportInbox() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [responseText, setResponseText] = useState("");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => base44.entities.SupportTicket.list("-created_date", 200),
  });

  const updateTicket = useMutation({
    mutationFn: ({ id, patch }) => base44.entities.SupportTicket.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      toast.success("Ticket updated");
    },
    onError: () => toast.error("Unable to update ticket."),
  });

  const handleRespond = (ticket) => {
    if (!responseText.trim()) return;
    updateTicket.mutate({
      id: ticket.id,
      patch: {
        admin_response: responseText.trim(),
        status: ticket.status === "open" ? "in_progress" : ticket.status,
      },
    });
    setResponseText("");
  };

  const advanceStatus = (ticket) => {
    const currentIdx = STATUS_FLOW.indexOf(ticket.status);
    const next = STATUS_FLOW[Math.min(currentIdx + 1, STATUS_FLOW.length - 1)];
    const patch = { status: next };
    if (next === "resolved" || next === "closed") {
      patch.resolved_at = new Date().toISOString();
    }
    updateTicket.mutate({ id: ticket.id, patch });
  };

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-8 text-center">
        <p className="text-sm text-white/50">This area is reserved for administrators.</p>
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-teal-400">
          <ChevronLeft className="h-4 w-4" /> Back to Settings
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin text-teal-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8 pt-2">
      <div className="flex items-center gap-3">
        <Link
          to="/settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-white/70 transition hover:text-white"
          style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", borderColor: "rgba(255,255,255,0.14)" }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-white">Support Inbox</h1>
          <p className="text-xs text-white/40">{tickets.length} {tickets.length === 1 ? "submission" : "submissions"} from your community</p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="glass-card rounded-3xl border p-10 text-center">
          <LifeBuoy className="mx-auto h-8 w-8 text-white/25" />
          <p className="mt-3 text-sm text-white/50">No support submissions yet.</p>
          <p className="text-xs text-white/30">When someone reaches out, their message will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const typeMeta = TICKET_TYPE_META[ticket.ticket_type] || TICKET_TYPE_META.support;
            const statusMeta = STATUS_META[ticket.status] || STATUS_META.open;
            const TypeIcon = typeMeta.icon;
            const isExpanded = expandedId === ticket.id;

            return (
              <div key={ticket.id} className="glass-card rounded-3xl border overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : ticket.id);
                    setResponseText("");
                  }}
                  className="w-full flex items-start gap-3 p-4 text-left transition hover:bg-white/[0.02]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                    <TypeIcon className={`h-4 w-4 ${typeMeta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{typeMeta.label}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      <span className="text-[10px] text-white/30">{ticket.category?.replace(/_/g, " ")}</span>
                    </div>
                    <p className="mt-1 text-xs text-white/50 line-clamp-2">{ticket.message}</p>
                    <p className="mt-1 text-[10px] text-white/30">
                      {format(new Date(ticket.created_date), "MMM d · h:mm a")}
                      {ticket.include_diagnostics ? " · diagnostics included" : ""}
                    </p>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/8 px-4 py-4 space-y-3" style={{ background: "rgba(255,255,255,0.015)" }}>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1">Message</p>
                      <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
                    </div>

                    {ticket.diagnostic_metadata && Object.keys(ticket.diagnostic_metadata).length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-1">Diagnostics (shared with consent)</p>
                        <pre className="text-[10px] text-white/50 bg-black/30 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(ticket.diagnostic_metadata, null, 2)}</pre>
                      </div>
                    )}

                    {ticket.admin_response && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-400/70 mb-1">Your response</p>
                        <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{ticket.admin_response}</p>
                      </div>
                    )}

                    <div>
                      <textarea
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        placeholder="Write a thoughtful reply..."
                        rows={3}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-teal-500/40"
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRespond(ticket)}
                          disabled={!responseText.trim() || updateTicket.isPending}
                          className="flex items-center gap-1.5 rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-2 text-xs font-semibold text-teal-300 transition hover:bg-teal-500/20 disabled:opacity-40"
                        >
                          <Send className="h-3 w-3" /> Save Response
                        </button>
                        {ticket.status !== "closed" && (
                          <button
                            type="button"
                            onClick={() => advanceStatus(ticket)}
                            disabled={updateTicket.isPending}
                            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/8 disabled:opacity-40"
                          >
                            Mark as {STATUS_FLOW[STATUS_FLOW.indexOf(ticket.status) + 1]?.replace(/_/g, " ") || "resolved"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}