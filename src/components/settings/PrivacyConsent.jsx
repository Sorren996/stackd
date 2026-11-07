import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";
import ConsentManagement from "@/components/settings/ConsentManagement";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";

export default function PrivacyConsent() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  /**
   * Closes the account on the server, then signs this device out.
   *
   * The server (deleteMyAccount) authorizes on the verified session, removes
   * the account's own records, sharing relationships and invites, deletes the
   * auth user record and confirms it is gone before it returns success. A
   * failure keeps the account open and is shown here as a retry — never as a
   * completed deletion.
   */
  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    setDeleteError("");
    try {
      // Stop anything still in flight so no screen re-creates settings while
      // the account is being closed.
      await queryClient.cancelQueries();
      const response = await base44.functions.invoke("deleteMyAccount", { confirm: "delete-my-account" });
      const data = response?.data || {};
      if (!data.ok) {
        setDeleteError(data.error || "Your account is still open. Please try again.");
        setIsDeletingAccount(false);
        return;
      }
      // The account is gone. Clear this device and land on the public sign-in.
      queryClient.clear();
      try {
        localStorage.removeItem("stackd_auth_provider");
      } catch { /* Device storage is not the account itself. */ }
      // Signed out through the platform's own logout, which also clears the
      // session cookie, and straight to the public sign-in — never the consent
      // or set-up screens.
      await logout(true, "/login?deleted=1");
      window.location.href = "/login?deleted=1";
    } catch (error) {
      const message = error?.response?.data?.error;
      setDeleteError(message || "We couldn't close your account just now. Nothing changed — please try again.");
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
            <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>
              All health data logged in Stackd, including glucose readings, insulin doses, and carbohydrate entries, is stored securely and is only accessible by you. We do not share, sell, or transmit your personal health information to any third parties.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>
              Data is encrypted in transit and at rest. You can delete your data at any time from this settings page.
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
                <p className="text-sm font-bold" style={{ color: "#c97060" }}>This closes your account for good</p>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "#c97060", opacity: 0.75 }}>
                  Your readings, doses, carb logs, notes, Dexcom link and the invites you&rsquo;ve sent will be
                  removed, and your sign-in will be closed. Anyone you share with loses access. This can&rsquo;t
                  be undone, and the data can&rsquo;t be recovered.
                </p>
                <p className="text-[11px] mt-2 leading-relaxed" style={{ color: "#c97060", opacity: 0.7 }}>
                  We keep one record that an account was deleted, for our audit log — it holds no health data.
                  A password saved in your phone or browser isn&rsquo;t removed by Stackd, so you may want to
                  clear it there too.
                </p>
              </div>
            </div>
            {deleteError ? (
              <p className="text-xs leading-relaxed" style={{ color: "#9c3f2e" }} role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError("");
                }}
                className="flex-1 text-sm py-3 rounded-2xl border transition-all font-medium"
                style={{ borderColor: "#eadccf", background: "#f7f1e8", color: "#6b6153" }}
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
                {isDeletingAccount ? "Closing account…" : "Yes, delete my account"}
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}