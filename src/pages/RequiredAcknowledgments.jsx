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
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "#f7f1e8" }}>
      <DocumentModal docKey={activeDoc} onClose={() => setActiveDoc(null)} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <div className="flex items-center gap-2">
          {!isFirstStep && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="flex h-8 w-8 items-center justify-center transition"
              style={{ color: "#6b6153" }}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {isFirstStep && <Leaf className="h-5 w-5" style={{ color: "#4d5742" }} />}
        </div>
        <span className="text-xs font-semibold" style={{ color: "#746959" }}>
          Step {step + 1} of {ACKNOWLEDGMENT_STEPS.length}
        </span>
        <button
          type="button"
          onClick={() => logout()}
          className="flex items-center gap-1.5 text-xs font-medium transition"
          style={{ color: "#6b6153" }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-2">
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#eadccf" }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: "#5b6550" }}
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
                    style={{ background: "radial-gradient(circle, rgba(91, 101, 80, 0.15), transparent 70%)" }}
                  >
                    <Leaf className="h-10 w-10" style={{ color: "#4d5742" }} />
                  </div>
                  <h1 className="mb-4 text-2xl font-semibold" style={{ color: "#3f3830" }}>Welcome to <span className="font-serif-italic">Stackd</span></h1>
                  <p className="mb-3 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
                    Before we begin your wellness journey together, we need to review a few important acknowledgments.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "#746959" }}>
                    This helps ensure you understand how Stackd supports you and what it can and cannot do. Take your time — there's no rush.
                  </p>
                </div>
              )}

              {currentStepData.sections && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold" style={{ color: "#3f3830" }}>{currentStepData.label}</h2>
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
                  <h2 className="text-lg font-semibold" style={{ color: "#3f3830" }}>Review & <span className="font-serif-italic">Accept</span></h2>
                  <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>
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
                            borderColor: checked ? "rgba(91, 101, 80, 0.25)" : "#eadccf",
                            background: checked ? "rgba(91, 101, 80, 0.06)" : "#fdf9f2",
                          }}
                        >
                          <div
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                            style={{
                              background: checked ? "#5b6550" : "#f7f1e8",
                            }}
                          >
                            {checked && <Check className="h-3 w-3" strokeWidth={3} style={{ color: "#f7f1e8" }} />}
                          </div>
                          <span className="text-xs font-medium" style={{ color: "#3f3830" }}>{section.title}</span>
                        </div>
                      );
                    })}
                  </div>
                  {!allDocsOpened && (
                    <p className="flex items-center gap-2 text-xs" style={{ color: "#af751b", opacity: 0.7 }}>
                      <AlertCircle className="h-3.5 w-3.5" />
                      Please open and review the Terms of Use and Privacy Notice.
                    </p>
                  )}
                  {submitError && (
                    <div className="rounded-xl border p-3" style={{ borderColor: "rgba(201,112,96,0.20)", background: "rgba(201,112,96,0.05)" }}>
                      <p className="flex items-center gap-2 text-xs" style={{ color: "#c97060" }}>
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {submitError}
                      </p>
                      <button
                        type="button"
                        onClick={handleRetry}
                        disabled={isSubmitting}
                        className="mt-2 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40"
                        style={{ borderColor: "rgba(201,112,96,0.20)", background: "rgba(201,112,96,0.05)", color: "#c97060" }}
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
        className="border-t px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        style={{ background: "#fdf9f2", borderColor: "#eadccf" }}
      >
        <div className="mx-auto max-w-md">
          {isLastStep ? (
            <button
              type="button"
              onClick={handleAccept}
              disabled={!canAccept}
              className="w-full rounded-2xl py-4 text-base font-semibold transition active:scale-[0.99] disabled:opacity-40"
              style={{
                background: canAccept ? "#3f3830" : "#eadccf",
                color: canAccept ? "#f7f1e8" : "#a89e8d",
                boxShadow: canAccept ? "0 4px 16px rgba(63, 56, 48, 0.15)" : "none",
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
              className="w-full rounded-2xl py-4 text-base font-semibold transition active:scale-[0.99] disabled:opacity-40"
              style={{
                background: canProceed ? "#3f3830" : "#eadccf",
                color: canProceed ? "#f7f1e8" : "#a89e8d",
                boxShadow: canProceed ? "0 4px 16px rgba(63, 56, 48, 0.15)" : "none",
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