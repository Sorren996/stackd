import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Shield, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ConsentManagement from "@/components/settings/ConsentManagement";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";

export default function PrivacyConsent() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await Promise.all([
        base44.entities.InsulinDose.deleteMany({}),
        base44.entities.GlucoseReading.deleteMany({}),
        base44.entities.CarbEntry.deleteMany({}),
        base44.entities.JournalEntry.deleteMany({}),
        base44.entities.UserSettings.deleteMany({}),
        base44.entities.DexcomConnection.deleteMany({}),
        base44.entities.SplitDosePlan.deleteMany({}),
        base44.entities.SplitDosePreset.deleteMany({}),
        base44.entities.DailySummary.deleteMany({}),
        base44.entities.GlucoseEvent.deleteMany({}),
        base44.entities.MealResponseAnalysis.deleteMany({}),
        base44.entities.MealMatchFeedback.deleteMany({}),
        base44.entities.UserPatternProfile.deleteMany({}),
        base44.entities.CoachInsight.deleteMany({}),
        base44.entities.AnalysisJob.deleteMany({}),
        base44.entities.UserAcknowledgment.deleteMany({}),
        base44.entities.SupportTicket.deleteMany({}),
      ]);
      queryClient.clear();
      await logout(true);
    } catch {
      toast.error("We couldn't finish deleting your data. Please try again.");
      setIsDeletingAccount(false);
    }
  };

  return (
    <div className="space-y-6">
      <ConsentManagement />

      <SectionCard label="Privacy">
        <div className="flex items-start gap-3 pt-3 pb-2">
          <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#5b6550" }} />
          <div className="space-y-2">
            <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>Your data is private & secure</p>
            <p className="text-xs leading-relaxed" style={{ color: "#8a7f70" }}>
              All health data logged in Stackd — including glucose readings, insulin doses, and carbohydrate entries — is stored securely and is only accessible by you. We do not share, sell, or transmit your personal health information to any third parties.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "#8a7f70" }}>
              Data is encrypted in transit and at rest. You can export or delete your data at any time from this settings page.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard label="Danger Zone">
        {!showDeleteConfirm ? (
          <div className="pt-3 pb-2">
            <LedgerRow
              label="Delete account"
              value="Permanent"
              danger
              actionLabel="Delete"
              onClick={() => setShowDeleteConfirm(true)}
            />
          </div>
        ) : (
          <div className="rounded-2xl border p-5 space-y-4 mt-3 mb-2" style={{ background: "rgba(201,112,96,0.04)", borderColor: "rgba(201,112,96,0.20)" }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#c97060" }} />
              <div>
                <p className="text-sm font-bold" style={{ color: "#c97060" }}>This action cannot be undone</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "#c97060", opacity: 0.7 }}>
                  All your data — glucose readings, insulin doses, carbohydrate logs, and account information — will be permanently and irreversibly deleted. There is no way to recover this data.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 text-sm py-3 rounded-2xl border transition-all font-medium"
                style={{ borderColor: "#eadccf", background: "#f7f1e8", color: "#8a7f70" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="flex-1 text-sm py-3 rounded-2xl transition-all font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "#c97060", color: "#f7f1e8" }}
              >
                {isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isDeletingAccount ? "Deleting..." : "Yes, Delete Everything"}
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}