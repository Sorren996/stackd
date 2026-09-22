import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronDown, ChevronUp, LifeBuoy, Bug, MessageSquare, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import PageHeader from "@/components/editorial/PageHeader";
import HairlineSection from "@/components/editorial/HairlineSection";

const TICKET_TYPE_META = {
  support: { icon: LifeBuoy, label: "Support", color: "#5b6550" },
  bug: { icon: Bug, label: "Bug", color: "#c97060" },
  feedback: { icon: MessageSquare, label: "Feedback", color: "#af751b" },
};

const STATUS_META = {
  open: { label: "Open", color: "#5b6550" },
  in_progress: { label: "In Progress", color: "#af751b" },
  resolved: { label: "Resolved", color: "#5b6550" },
  closed: { label: "Closed", color: "#8a7f70" },
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
        <p className="text-sm" style={{ color: "#8a7f70" }}>This area is reserved for administrators.</p>
        <Link to="/settings" className="inline-flex items-center gap-1 text-sm" style={{ color: "#5b6550" }}>
          <ChevronLeft className="h-4 w-4" /> Back to Settings
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#5b6550" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8 pt-2">
      <PageHeader italicWord="inbox" rightText={`${tickets.length} ${tickets.length === 1 ? "submission" : "submissions"}`} />

      {tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LifeBuoy className="h-8 w-8 mb-3" style={{ color: "#a89e8d" }} />
          <p className="text-sm" style={{ color: "#8a7f70" }}>No support submissions yet.</p>
          <p className="text-xs mt-1" style={{ color: "#a89e8d" }}>When someone reaches out, their message will appear here.</p>
        </div>
      ) : (
        <HairlineSection label="Submissions">
          <div className="pt-1 pb-2">
            {tickets.map((ticket) => {
              const typeMeta = TICKET_TYPE_META[ticket.ticket_type] || TICKET_TYPE_META.support;
              const statusMeta = STATUS_META[ticket.status] || STATUS_META.open;
              const isExpanded = expandedId === ticket.id;

              return (
                <div key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : ticket.id);
                      setResponseText("");
                    }}
                    className="flex w-full items-baseline gap-2 py-2.5 text-left transition hover:opacity-70"
                  >
                    <span className="shrink-0 text-sm font-medium" style={{ color: "#3f3830" }}>
                      {typeMeta.label}
                    </span>
                    <span className="shrink-0 text-[10px]" style={{ color: "#a89e8d" }}>
                      {ticket.category?.replace(/_/g, " ")}
                    </span>
                    <span className="flex-1 overflow-hidden">
                      <span className="dotted-leader block" />
                    </span>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: statusMeta.color }}>
                      {statusMeta.label}
                    </span>
                    <span className="shrink-0 text-[10px]" style={{ color: "#a89e8d" }}>
                      {format(new Date(ticket.created_date), "MMM d")}
                    </span>
                    <span className="shrink-0">
                      {isExpanded ? <ChevronUp className="h-4 w-4" style={{ color: "#a89e8d" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "#a89e8d" }} />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="pb-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#a89e8d" }}>Message</p>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#3f3830" }}>{ticket.message}</p>
                        <p className="mt-1 text-[10px]" style={{ color: "#a89e8d" }}>
                          {format(new Date(ticket.created_date), "MMM d · h:mm a")}
                          {ticket.include_diagnostics ? " · diagnostics included" : ""}
                        </p>
                      </div>

                      {ticket.diagnostic_metadata && Object.keys(ticket.diagnostic_metadata).length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#a89e8d" }}>Diagnostics (shared with consent)</p>
                          <pre className="text-[10px] rounded-xl p-3 overflow-x-auto whitespace-pre-wrap" style={{ background: "#fdf9f2", border: "1px solid #eadccf", color: "#8a7f70" }}>{JSON.stringify(ticket.diagnostic_metadata, null, 2)}</pre>
                        </div>
                      )}

                      {ticket.admin_response && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#5b6550", opacity: 0.7 }}>Your response</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "#3f3830" }}>{ticket.admin_response}</p>
                        </div>
                      )}

                      <div>
                        <textarea
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Write a thoughtful reply..."
                          rows={3}
                          className="w-full rounded-2xl border px-3 py-2.5 text-sm focus:outline-none resize-none"
                          style={{ borderColor: "#eadccf", background: "#fdf9f2", color: "#3f3830" }}
                        />
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRespond(ticket)}
                            disabled={!responseText.trim() || updateTicket.isPending}
                            className="flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition disabled:opacity-40"
                            style={{ borderColor: "rgba(91,101,80,0.25)", background: "rgba(91,101,80,0.10)", color: "#5b6550" }}
                          >
                            <Send className="h-3 w-3" /> Save Response
                          </button>
                          {ticket.status !== "closed" && (
                            <button
                              type="button"
                              onClick={() => advanceStatus(ticket)}
                              disabled={updateTicket.isPending}
                              className="rounded-xl border px-4 py-2 text-xs font-semibold transition disabled:opacity-40"
                              style={{ borderColor: "#eadccf", background: "#f7f1e8", color: "#8a7f70" }}
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
        </HairlineSection>
      )}
    </div>
  );
}