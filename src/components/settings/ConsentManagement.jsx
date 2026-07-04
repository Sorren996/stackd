import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ACKNOWLEDGMENT_VERSIONS, LEGAL_DOCUMENTS } from "@/lib/acknowledgmentConfig";
import DocumentModal from "@/components/acknowledgments/DocumentModal";
import { Shield, FileText, AlertTriangle, Loader2, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

export default function ConsentManagement() {
  const { user, checkUserAuth } = useAuth();
  const queryClient = useQueryClient();
  const [activeDoc, setActiveDoc] = useState(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    if (!showWithdrawModal) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.documentElement.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [showWithdrawModal]);

  const { data: ackRecords = [], isLoading } = useQuery({
    queryKey: ["acknowledgment-history"],
    queryFn: () => base44.entities.UserAcknowledgment.list("-accepted_at", 50),
  });

  const latestAck = ackRecords[0];
  const isComplete = user?.required_acknowledgments_complete && user?.health_data_consent_active;
  const bundleCurrent = user?.current_acknowledgment_bundle_version === ACKNOWLEDGMENT_VERSIONS.acknowledgment_bundle_version;

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await base44.auth.updateMe({
        health_data_consent_active: false,
        required_acknowledgments_complete: false,
        required_reconsent: true,
      });
      await checkUserAuth();
      queryClient.invalidateQueries({ queryKey: ["latest-acknowledgment"] });
      queryClient.invalidateQueries({ queryKey: ["acknowledgment-history"] });
      toast.info("Health data consent withdrawn. Please review the required acknowledgments to continue.");
    } catch {
      toast.error("Unable to withdraw consent. Please try again.");
    } finally {
      setIsWithdrawing(false);
      setShowWithdrawModal(false);
    }
  };

  return (
    <>
      <DocumentModal docKey={activeDoc} onClose={() => setActiveDoc(null)} />

      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Legal & Consent</h3>

        {/* Status card */}
        <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-3xl p-4 space-y-4">
          <div className="flex items-center gap-3">
            {isComplete && bundleCurrent ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#5ba88a]" />
            ) : (
              <XCircle className="w-5 h-5 shrink-0 text-amber-400" />
            )}
            <div>
              <p className="text-sm font-semibold text-white/90">
                {isComplete && bundleCurrent ? "All acknowledgments current" : "Acknowledgments required"}
              </p>
              <p className="text-xs text-white/40">
                {isComplete && bundleCurrent
                  ? "Your acknowledgments are up to date."
                  : "Please complete the required acknowledgments."}
              </p>
            </div>
          </div>

          {latestAck?.accepted_at && (
            <div className="space-y-1 border-t border-white/8 pt-3">
              <div className="flex justify-between">
                <span className="text-xs text-white/35">Last accepted</span>
                <span className="text-xs font-medium text-white/60">
                  {format(new Date(latestAck.accepted_at), "MMM d, yyyy 'at' h:mm a")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-white/35">Bundle version</span>
                <span className="text-xs font-medium text-white/60">{latestAck.acknowledgment_bundle_version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-white/35">Health data consent</span>
                <span className="text-xs font-medium" style={{ color: user?.health_data_consent_active ? "#5ba88a" : "#d4a056" }}>
                  {user?.health_data_consent_active ? "Active" : "Withdrawn"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Document links */}
        <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-3xl p-2">
          {Object.entries(LEGAL_DOCUMENTS).map(([key, doc]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveDoc(key)}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-3 transition hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-white/40" />
                <div className="text-left">
                  <p className="text-sm font-medium text-white/80">{doc.title}</p>
                  <p className="text-[10px] text-white/30">Version {doc.version}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30" />
            </button>
          ))}
        </div>

        {/* Acknowledgment history */}
        {ackRecords.length > 0 && (
          <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-3xl p-4 space-y-3">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider">Acknowledgment History</p>
            <div className="space-y-2">
              {ackRecords.slice(0, 5).map((record) => (
                <div key={record.id} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-white/70">
                      {record.consent_source.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-white/30">
                      {format(new Date(record.accepted_at || record.created_date), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.withdrawn_at && (
                      <span className="text-[10px] font-medium text-amber-400/60">withdrawn</span>
                    )}
                    <span className="text-[10px] text-white/30">v{record.acknowledgment_bundle_version}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Withdraw consent */}
        {isComplete && (
          <button
            type="button"
            onClick={() => setShowWithdrawModal(true)}
            className="w-full flex items-center justify-between rounded-2xl border border-amber-500/15 bg-amber-500/[0.03] px-4 py-3.5 transition hover:bg-amber-500/[0.06]"
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-amber-400/70" />
              <div className="text-left">
                <p className="text-sm font-medium text-white/70">Withdraw Health Data Consent</p>
                <p className="text-[10px] text-white/30">Revoke consent and review acknowledgments again</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/30" />
          </button>
        )}
      </div>

      {/* Withdrawal modal */}
      <AnimatePresence>
{showWithdrawModal && (
  typeof document !== "undefined" &&
  createPortal(
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    onClick={() => !isWithdrawing && setShowWithdrawModal(false)}
  >
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.96, opacity: 0 }}
      className="w-full max-w-sm rounded-xl bg-neutral-900 p-5 shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
              <div className="mb-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <h3 className="text-base font-bold text-white">Withdraw Health Data Consent?</h3>
                  <p className="mt-1 text-xs text-white/50">
                    Withdrawing consent will affect your access to Stackd's features.
                  </p>
                </div>
              </div>
              <div className="space-y-2.5 mb-5">
                {[
                  "All health-related features will be locked until you re-complete the acknowledgment flow.",
                  "Your existing health data will remain stored unless you explicitly delete it.",
                  "You can request full data deletion from Settings at any time.",
                  "Legally required acknowledgment records may be retained for compliance.",
                  "Withdrawing consent does not automatically cancel any subscription.",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/30" />
                    <p className="text-xs leading-relaxed text-white/55">{item}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawModal(false)}
                  disabled={isWithdrawing}
                  className="flex-1 rounded-2xl border border-white/10 py-3 text-sm font-medium text-white/60 transition hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                  className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
                  style={{ background: "linear-gradient(145deg, rgba(212,160,86,0.85), rgba(201,112,96,0.75))" }}
                >
                  {isWithdrawing ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Withdrawing...
                    </span>
                  ) : (
                    "Withdraw Consent"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </AnimatePresence>
    </>
  );
}