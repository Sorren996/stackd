import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import {
  ACKNOWLEDGMENT_VERSIONS,
  ACKNOWLEDGMENT_STEPS,
  CHECKBOX_KEYS,
  DOCUMENT_KEYS,
  LEGAL_DOCUMENTS,
} from "@/lib/acknowledgmentConfig";
import NoticeSection from "@/components/acknowledgments/NoticeSection";
import DocumentModal from "@/components/acknowledgments/DocumentModal";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, LogOut, Leaf, Check, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { SUPPORTIVE_ERRORS } from "@/lib/supportiveErrors";

export default function RequiredAcknowledgments() {
  const { user, checkUserAuth, logout } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [checkboxes, setCheckboxes] = useState(
    CHECKBOX_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {})
  );
  const [openedDocs, setOpenDocs] = useState(new Set());
  const [activeDoc, setActiveDoc] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const { data: existingAcks = [] } = useQuery({
    queryKey: ["latest-acknowledgment"],
    queryFn: () => base44.entities.UserAcknowledgment.list("-accepted_at", 1),
  });

  const consentSource = existingAcks.length > 0 ? "reconsent" : "initial_onboarding";
  const currentStepData = ACKNOWLEDGMENT_STEPS[step];
  const isLastStep = step === ACKNOWLEDGMENT_STEPS.length - 1;
  const isFirstStep = step === 0;

  const allCheckboxesChecked = Object.values(checkboxes).every(Boolean);
  const allDocsOpened = DOCUMENT_KEYS.every((d) => openedDocs.has(d));
  const canAccept = allCheckboxesChecked && allDocsOpened && !isSubmitting;

  const stepCheckboxesChecked = useMemo(() => {
    if (!currentStepData.sections) return true;
    return currentStepData.sections.every((s) => checkboxes[s.checkboxId]);
  }, [currentStepData, checkboxes]);

  const canProceed = stepCheckboxesChecked && !isSubmitting;

  const toggleCheckbox = (id, val) => {
    setCheckboxes((prev) => ({ ...prev, [id]: val }));
  };

  const openDocument = (docKey) => {
    setActiveDoc(docKey);
    setOpenDocs((prev) => new Set([...prev, docKey]));
  };

  const handleAccept = async () => {
    if (!canAccept || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const now = new Date().toISOString();
      const hasCurrentRecord = existingAcks.some(
        (r) =>
          r.acknowledgment_bundle_version === ACKNOWLEDGMENT_VERSIONS.acknowledgment_bundle_version &&
          !r.withdrawn_at &&
          CHECKBOX_KEYS.every((flag) => r[flag])
      );

      if (!hasCurrentRecord) {
        await base44.entities.UserAcknowledgment.create({
          user_id: user?.id,
          user_email: user?.email,
          user_display_name: user?.full_name,
          acknowledgment_bundle_version: ACKNOWLEDGMENT_VERSIONS.acknowledgment_bundle_version,
          terms_version: ACKNOWLEDGMENT_VERSIONS.terms_version,
          privacy_notice_version: ACKNOWLEDGMENT_VERSIONS.privacy_notice_version,
          medical_disclaimer_version: ACKNOWLEDGMENT_VERSIONS.medical_disclaimer_version,
          emergency_notice_version: ACKNOWLEDGMENT_VERSIONS.emergency_notice_version,
          insulin_estimate_notice_version: ACKNOWLEDGMENT_VERSIONS.insulin_estimate_notice_version,
          insulin_settings_notice_version: ACKNOWLEDGMENT_VERSIONS.insulin_settings_notice_version,
          notification_notice_version: ACKNOWLEDGMENT_VERSIONS.notification_notice_version,
          health_data_consent_version: ACKNOWLEDGMENT_VERSIONS.health_data_consent_version,
          terms_accepted: true,
          privacy_notice_acknowledged: true,
          medical_disclaimer_accepted: true,
          emergency_notice_accepted: true,
          insulin_estimate_notice_accepted: true,
          insulin_settings_notice_accepted: true,
          notification_notice_accepted: true,
          health_data_consent_accepted: true,
          accepted_at: now,
          account_created_at: user?.created_date,
          app_version: "1.0.0",
          platform: "web",
          device_type: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
          locale: typeof navigator !== "undefined" ? navigator.language : "en",
          timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
          consent_source: consentSource,
        });
      }

      await base44.auth.updateMe({
        required_acknowledgments_complete: true,
        current_acknowledgment_bundle_version: ACKNOWLEDGMENT_VERSIONS.acknowledgment_bundle_version,
        last_acknowledged_at: now,
        required_reconsent: false,
        health_data_consent_active: true,
      });

      await checkUserAuth();
      queryClient.invalidateQueries({ queryKey: ["latest-acknowledgment"] });
    } catch {
      setSubmitError(SUPPORTIVE_ERRORS.submit);
      setIsSubmitting(false);
    }
  };

  const handleRetry = () => {
    setSubmitError(null);
    handleAccept();
  };

  const allSections = ACKNOWLEDGMENT_STEPS.filter((s) => s.sections).flatMap((s) => s.sections);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "radial-gradient(ellipse 120% 60% at 50% 100%, hsl(162,28%,10%) 0%, hsl(160,14%,7%) 55%, hsl(158,10%,5%) 100%)" }}>
      <DocumentModal docKey={activeDoc} onClose={() => setActiveDoc(null)} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {isFirstStep && <Leaf className="h-5 w-5 text-[#5ba88a]" />}
        </div>
        <span className="text-xs font-semibold text-white/40">
          Step {step + 1} of {ACKNOWLEDGMENT_STEPS.length}
        </span>
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-2">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #5ba88a, #5ba3b8)" }}
            animate={{ width: `${((step + 1) / ACKNOWLEDGMENT_STEPS.length) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "thin" }}>
        <div className="mx-auto max-w-md">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStepData.key === "welcome" && (
                <div className="flex flex-col items-center py-8 text-center">
                  <div
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-full"
                    style={{ background: "radial-gradient(circle, rgba(91,168,138,0.2), transparent 70%)" }}
                  >
                    <Leaf className="h-10 w-10 text-[#5ba88a]" />
                  </div>
                  <h1 className="mb-4 text-2xl font-bold text-white">Welcome to Stackd</h1>
                  <p className="mb-3 text-sm leading-relaxed text-white/55">
                    Before we begin your wellness journey together, we need to review a few important acknowledgments.
                  </p>
                  <p className="text-sm leading-relaxed text-white/45">
                    This helps ensure you understand how Stackd supports you and what it can and cannot do. Take your time — there's no rush.
                  </p>
                </div>
              )}

              {currentStepData.sections && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-white">{currentStepData.label}</h2>
                  {currentStepData.sections.map((section) => (
                    <NoticeSection
                      key={section.checkboxId}
                      section={section}
                      checkboxes={checkboxes}
                      onToggle={toggleCheckbox}
                      openedDocs={openedDocs}
                      onOpenDocument={openDocument}
                    />
                  ))}
                </div>
              )}

              {currentStepData.key === "review" && (
                <div className="space-y-5">
                  <h2 className="text-lg font-bold text-white">Review & Accept</h2>
                  <p className="text-sm leading-relaxed text-white/55">
                    Please confirm that you have reviewed and accepted all of the following:
                  </p>
                  <div className="space-y-2">
                    {allSections.map((section) => {
                      const checked = checkboxes[section.checkboxId];
                      return (
                        <div
                          key={section.checkboxId}
                          className="flex items-center gap-3 rounded-xl border p-3"
                          style={{
                            borderColor: checked ? "rgba(91,168,138,0.25)" : "rgba(255,255,255,0.08)",
                            background: checked ? "rgba(91,168,138,0.06)" : "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                            style={{
                              background: checked ? "rgba(91,168,138,0.85)" : "rgba(255,255,255,0.06)",
                            }}
                          >
                            {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-xs font-medium text-white/70">{section.title}</span>
                        </div>
                      );
                    })}
                  </div>
                  {!allDocsOpened && (
                    <p className="flex items-center gap-2 text-xs text-amber-400/70">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Please open and review the Terms of Use and Privacy Notice.
                    </p>
                  )}
                  {submitError && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                      <p className="flex items-center gap-2 text-xs text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {submitError}
                      </p>
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={isSubmitting}
                        className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-40"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        className="border-t border-white/10 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        style={{ background: "linear-gradient(160deg, hsl(162,12%,9%), hsl(162,10%,6%))" }}
      >
        <div className="mx-auto max-w-md">
          {isLastStep ? (
            <button
              type="button"
              onClick={handleAccept}
              disabled={!canAccept}
              className="w-full rounded-2xl py-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
              style={{
                background: canAccept
                  ? "linear-gradient(145deg, rgba(91,168,138,0.9), rgba(91,163,184,0.75))"
                  : "rgba(255,255,255,0.06)",
                boxShadow: canAccept
                  ? "0 10px 30px rgba(91,163,184,0.2), inset 0 1px 1px rgba(255,255,255,0.2)"
                  : "none",
              }}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                "Accept and Continue"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => canProceed && setStep((s) => s + 1)}
              disabled={!canProceed}
              className="w-full rounded-2xl py-4 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
              style={{
                background: canProceed
                  ? "linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))"
                  : "rgba(255,255,255,0.06)",
                boxShadow: canProceed
                  ? "0 10px 30px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.15)"
                  : "none",
              }}
            >
              {isFirstStep ? "Begin" : "Continue"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}