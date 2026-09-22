import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ACKNOWLEDGMENT_VERSIONS, LEGAL_DOCUMENTS } from "@/lib/acknowledgmentConfig";
import DocumentModal from "@/components/acknowledgments/DocumentModal";
import { Shield, AlertTriangle, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import HairlineSection from "@/components/editorial/HairlineSection";
import LedgerRow from "@/components/editorial/LedgerRow";

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

      <div className="space-y-6">
        <HairlineSection label="Legal & Consent">
          <div className="pt-3 pb-2 space-y-3">
            <div className="flex items-center gap-3">
              {isComplete && bundleCurrent ? (
                <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#4d5742" }} />
              ) : (
                <XCircle className="w-5 h-5 shrink-0" style={{ color: "#8a5a12" }} />
              )}
              <div>
                <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                  {isComplete && bundleCurrent ? "All acknowledgments current" : "Acknowledgments required"}
                </p>
                <p className="text-xs" style={{ color: "#746959" }}>
                  {isComplete && bundleCurrent
                    ? "Your acknowledgments are up to date."
                    : "Please complete the required acknowledgments."}
                </p>
              </div>
            </div>

            {latestAck?.accepted_at && (
              <div className="space-y-1 border-t pt-3" style={{ borderColor: "#eadccf" }}>
                <LedgerRow label="Last accepted" value={format(new Date(latestAck.accepted_at), "MMM d, yyyy")} />
                <LedgerRow label="Bundle version" value={latestAck.acknowledgment_bundle_version} />
                <LedgerRow
                  label="Health data consent"
                  value={user?.health_data_consent_active ? "Active" : "Withdrawn"}
                />
              </div>
            )}
          </div>
        </HairlineSection>

        <HairlineSection label="Documents">
          <div className="pt-1 pb-2">
            {Object.entries(LEGAL_DOCUMENTS).map(([key, doc]) => (
              <LedgerRow
                key={key}
                label={doc.title}
                value={`v${doc.version}`}
                onClick={() => setActiveDoc(key)}
              />
            ))}
          </div>
        </HairlineSection>

        {ackRecords.length > 0 && (
          <HairlineSection label="Acknowledgment History">
            <div className="pt-1 pb-2">
              {ackRecords.slice(0, 5).map((record) => (
                <LedgerRow
                  key={record.id}
                  label={record.consent_source.replace(/_/g, " ")}
                  value={record.withdrawn_at ? "withdrawn" : `v${record.acknowledgment_bundle_version}`}
                  timestamp={format(new Date(record.accepted_at || record.created_date), "MMM d, yyyy")}
                />
              ))}
            </div>
          </HairlineSection>
        )}

        {isComplete && (
          <HairlineSection label="Withdraw">
            <div className="pt-3 pb-2">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                className="flex w-full items-center gap-3 text-left transition hover:opacity-70"
              >
                <Shield className="w-4 h-4 shrink-0" style={{ color: "#8a5a12", opacity: 0.7 }} />
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: "#3f3830" }}>Withdraw Health Data Consent</p>
                  <p className="text-[10px]" style={{ color: "#746959" }}>Revoke consent and review acknowledgments again</p>
                </div>
                <span className="text-sm" style={{ color: "#746959" }}>›</span>
              </button>
            </div>
          </HairlineSection>
        )}

        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#746959" }} />
          </div>
        )}
      </div>

      {/* Withdrawal modal */}
      {typeof document !== "undefined" && showWithdrawModal &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[250] flex items-center justify-center p-4"
              style={{ background: "rgba(63, 56, 48, 0.25)" }}
              onClick={() => !isWithdrawing && setShowWithdrawModal(false)}
            >
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="w-full max-w-md rounded-3xl border p-5"
                style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 8px 28px rgba(63, 56, 48, 0.12)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#8a5a12" }} />
                  <div>
                    <h3 className="text-base font-bold" style={{ color: "#3f3830" }}>Withdraw Health Data Consent?</h3>
                    <p className="mt-1 text-xs" style={{ color: "#6b6153" }}>
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
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "#a89e8d" }} />
                      <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>{item}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowWithdrawModal(false)}
                    disabled={isWithdrawing}
                    className="flex-1 rounded-2xl border py-3 text-sm font-medium transition disabled:opacity-50"
                    style={{ borderColor: "#eadccf", background: "#f7f1e8", color: "#6b6153" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={isWithdrawing}
                    className="flex-1 rounded-2xl py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50"
                    style={{ background: "#af751b", color: "#f7f1e8" }}
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
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}