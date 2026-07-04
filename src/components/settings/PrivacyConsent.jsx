import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Shield, Trash2, AlertTriangle, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import ConsentManagement from "@/components/settings/ConsentManagement";

export default function PrivacyConsent() {
  const { authLogout } = useAuth();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    const [doses, readings, carbs] = await Promise.all([
      base44.entities.InsulinDose.list("-administered_at", 5000),
      base44.entities.GlucoseReading.list("-recorded_at", 5000),
      base44.entities.CarbEntry.list("-consumed_at", 5000),
    ]);
    await Promise.all([
      ...doses.map((d) => base44.entities.InsulinDose.delete(d.id)),
      ...readings.map((r) => base44.entities.GlucoseReading.delete(r.id)),
      ...carbs.map((c) => base44.entities.CarbEntry.delete(c.id)),
    ]);
    queryClient.clear();
    await authLogout(true);
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const doses = await base44.entities.InsulinDose.list("-administered_at", 1000);
      const glucose = await base44.entities.GlucoseReading.list("-recorded_at", 1000);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const filteredDoses = doses.filter((d) => new Date(d.administered_at).getTime() >= cutoff);
      const filteredGlucose = glucose.filter((g) => new Date(g.recorded_at).getTime() >= cutoff);

      let csv = "Type,Value / Units,Insulin Type,Timestamp,Notes\n";
      filteredDoses.forEach((d) => {
        csv += `Insulin,${d.units},"${d.insulin_type}",${d.administered_at},"${d.notes || ""}"\n`;
      });
      filteredGlucose.forEach((g) => {
        csv += `Glucose,${g.value},,${g.recorded_at},"${g.notes || ""}"\n`;
      });

      const link = document.createElement("a");
      link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
      link.download = `stackd_30day_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Exported 30 days of data!");
    } catch {
      toast.error("We couldn't export your data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ConsentManagement />

      {/* Privacy Notice */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Privacy</h3>
        <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-3xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-white/90">Your data is private & secure</p>
              <p className="text-xs text-white/40 leading-relaxed">
                All health data logged in Stackd — including glucose readings, insulin doses, and carbohydrate entries — is stored securely and is only accessible by you. We do not share, sell, or transmit your personal health information to any third parties.
              </p>
              <p className="text-xs text-white/40 leading-relaxed">
                Data is encrypted in transit and at rest. You can export or delete your data at any time from this settings page.
              </p>
            </div>
          </div>

       
         
        </div>
      </div>

      {/* Delete Account */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Danger Zone</h3>
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-red-500/10 text-red-500/50 hover:bg-red-500/5 hover:text-red-400 transition-all text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Delete Account
          </button>
        ) : (
          <div className="bg-red-950/30 border border-red-500/20 rounded-3xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-300">This action cannot be undone</p>
                <p className="text-xs text-red-400/70 mt-1 leading-relaxed">
                  All your data — glucose readings, insulin doses, carbohydrate logs, and account information — will be permanently and irreversibly deleted. There is no way to recover this data.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 text-sm py-3 rounded-2xl border border-white/10 text-white/60 hover:bg-white/5 transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount}
                className="flex-1 text-sm py-3 rounded-2xl bg-red-600/80 hover:bg-red-600 text-white transition-all font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isDeletingAccount ? "Deleting..." : "Yes, Delete Everything"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}