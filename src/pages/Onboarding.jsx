import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { cacheSettingsLocally } from "@/lib/userSettings";
import InsulinLibraryStep from "@/components/onboarding/InsulinLibraryStep";
import DosePlanStep from "@/components/onboarding/DosePlanStep";
import DexcomConnectStep from "@/components/onboarding/DexcomConnectStep";

const COPPER = "#9c5228";
const CANVAS = "#f7f1e8";

/**
 * Post-signup onboarding — 3-step walkthrough shown only to new users.
 *
 * Step 1: Insulin library (required — cannot skip)
 * Step 2: Dose plan (optional — skippable, dose math stays paused)
 * Step 3: Dexcom connection (optional — skippable)
 *
 * Each step writes to the same UserSettings entity the app already uses.
 * On completion, calls the completeOnboarding backend function which sets
 * onboarding_completed = true and writes an AuditLog entry.
 */
export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [completing, setCompleting] = useState(false);
  const queryClient = useQueryClient();

  const saveSettings = async (fields) => {
    const settings = queryClient.getQueryData(["user-settings"]);
    let saved;
    if (settings?.id) {
      saved = await base44.entities.UserSettings.update(settings.id, fields);
      saved = { ...settings, ...saved };
    } else {
      const user = await base44.auth.me();
      saved = await base44.entities.UserSettings.create({
        ...fields,
        username: user?.full_name || user?.email,
      });
    }
    queryClient.setQueryData(["user-settings"], saved);
    const user = await base44.auth.me();
    if (user?.id) cacheSettingsLocally(user.id, saved);
    window.dispatchEvent(new Event("insulin-settings-updated"));
    window.dispatchEvent(new Event("target-range-updated"));
  };

  const handleStep1Continue = async (data) => {
    try {
      await saveSettings(data);
      setStep(2);
    } catch {
      toast.error("Couldn't save your insulin selection. Please try again.");
    }
  };

  const handleStep2Confirm = async (data) => {
    try {
      await saveSettings(data);
      setStep(3);
    } catch {
      toast.error("Couldn't save your plan. Please try again.");
    }
  };

  const handleStep2Skip = () => {
    setStep(3);
  };

  const completeOnboarding = async () => {
    setCompleting(true);
    try {
      await base44.functions.invoke("completeOnboarding", {});
      await queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success("You're all set. Welcome to Stackd.");
      // Hard redirect so the app re-initializes with onboarding completed.
      window.location.href = "/";
    } catch {
      toast.error("Something went wrong. Please try again.");
      setCompleting(false);
    }
  };

  return (
    <>
      {step === 1 && (
        <InsulinLibraryStep onContinue={handleStep1Continue} onBack={() => {}} />
      )}
      {step === 2 && (
        <DosePlanStep
          onConfirm={handleStep2Confirm}
          onSkip={handleStep2Skip}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <DexcomConnectStep
          onComplete={completeOnboarding}
          onBack={() => setStep(2)}
          completing={completing}
        />
      )}

      {completing && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(247,241,232,0.8)" }}
        >
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: COPPER }} />
        </div>
      )}
    </>
  );
}