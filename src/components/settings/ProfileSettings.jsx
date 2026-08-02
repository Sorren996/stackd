import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { User, Mail, Lock, Loader2, Check, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function ProfileSettings() {
  const { user, checkUserAuth } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  const [passwordStep, setPasswordStep] = useState("idle");
  const [isSendingReset, setIsSendingReset] = useState(false);

  useEffect(() => {
    if (user?.full_name) setNameValue(user.full_name);
  }, [user?.full_name]);

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      toast.error("Please enter your name.");
      return;
    }
    setIsSavingName(true);
    try {
      await base44.auth.updateMe({ full_name: trimmed });
      await checkUserAuth();
      setEditingName(false);
      toast.success("Your name has been updated.");
    } catch {
      toast.error("We couldn't save that. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) {
      toast.error("We couldn't find your email to send a reset link.");
      return;
    }
    setIsSendingReset(true);
    try {
      await base44.auth.resetPasswordRequest(user.email);
    } catch {
      // Always show success — the API hides whether the email exists
    } finally {
      setIsSendingReset(false);
      setPasswordStep("sent");
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="px-1 text-sm font-bold uppercase tracking-wider text-emerald-950">Profile Settings</h3>

      <div className="rounded-3xl border border-white/45 bg-white/25 p-2 backdrop-blur-md">
        {/* Name */}
        <div className="rounded-2xl px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <User className="w-4 h-4 shrink-0 text-emerald-800/70" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-emerald-800/60">Full Name</p>
                {editingName ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      className="w-full rounded-xl border border-white/45 bg-white/40 px-3 py-2 text-sm font-semibold text-emerald-950 outline-none focus:border-teal-500/50"
                      placeholder="Your name"
                      autoFocus
                    />
                  </div>
                ) : (
                  <p className="truncate text-sm font-semibold text-emerald-950">
                    {user?.full_name || "Not set"}
                  </p>
                )}
              </div>
            </div>
            {!editingName ? (
              <button
                type="button"
                onClick={() => {
                  setNameValue(user?.full_name || "");
                  setEditingName(true);
                }}
                className="shrink-0 flex items-center gap-1.5 rounded-full border border-white/45 bg-white/40 px-3 py-1.5 text-xs font-medium text-emerald-900/70 transition hover:text-emerald-950"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false);
                    setNameValue(user?.full_name || "");
                  }}
                  disabled={isSavingName}
                  className="rounded-full border border-white/45 px-3 py-1.5 text-xs font-medium text-emerald-900/70 transition hover:text-emerald-950 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
                  style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.9), rgba(91,163,184,0.8))" }}
                >
                  {isSavingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="rounded-2xl border-t border-white/30 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Mail className="w-4 h-4 shrink-0 text-emerald-800/70" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-emerald-800/60">Email Address</p>
                <p className="truncate text-sm font-semibold text-emerald-950">
                  {user?.email || "Not available"}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-2 pl-7 text-[10px] leading-relaxed text-emerald-800/60">
            Your email was set during account creation and is used for secure sign-in and account recovery.
          </p>
        </div>

        {/* Password */}
        <div className="rounded-2xl border-t border-white/30 px-3 py-3">
          {passwordStep === "idle" ? (
            <button
              type="button"
              onClick={handleSendPasswordReset}
              disabled={isSendingReset}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Lock className="w-4 h-4 shrink-0 text-emerald-800/70" />
                <div>
                  <p className="text-sm font-semibold text-emerald-950">Password</p>
                  <p className="text-[10px] text-emerald-800/60">Password ••••••••</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-emerald-900/70">
                {isSendingReset ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Change
                    <ChevronRight className="w-4 h-4 text-emerald-900/50" />
                  </>
                )}
              </div>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 shrink-0 text-[#0d9488]" />
                <div>
                  <p className="text-sm font-semibold text-emerald-950">Check your email</p>
                  <p className="text-[10px] leading-relaxed text-emerald-800/70">
                    We've sent a secure password reset link to {user?.email}. Follow the link in your email to set a new password.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={isSendingReset}
                className="w-full rounded-xl border border-white/45 py-2.5 text-xs font-medium text-emerald-900/70 transition hover:text-emerald-950 disabled:opacity-40"
              >
                {isSendingReset ? "Resending..." : "Resend reset link"}
              </button>
              <button
                type="button"
                onClick={() => setPasswordStep("idle")}
                className="w-full text-xs text-emerald-800/60 transition hover:text-emerald-900/80"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}