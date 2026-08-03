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
      <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Profile Settings</h3>

      <div className="glass-card border rounded-3xl p-2">
        {/* Name */}
        <div className="rounded-2xl px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <User className="w-4 h-4 text-white/40 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-white/35 uppercase tracking-wider">Full Name</p>
                {editingName ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      value={nameValue}
                      onChange={(e) => setNameValue(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm font-semibold text-white outline-none focus:border-teal-500/40"
                      placeholder="Your name"
                      autoFocus
                    />
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-white/90 truncate">
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
                className="shrink-0 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:text-white"
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
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
                  style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))" }}
                >
                  {isSavingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="border-t border-white/8 rounded-2xl px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Mail className="w-4 h-4 text-white/40 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-white/35 uppercase tracking-wider">Email Address</p>
                <p className="text-sm font-semibold text-white/90 truncate">
                  {user?.email || "Not available"}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-white/30 leading-relaxed pl-7">
            Your email was set during account creation and is used for secure sign-in and account recovery.
          </p>
        </div>

        {/* Password */}
        <div className="border-t border-white/8 rounded-2xl px-3 py-3">
          {passwordStep === "idle" ? (
            <button
              type="button"
              onClick={handleSendPasswordReset}
              disabled={isSendingReset}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Lock className="w-4 h-4 text-white/40 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-white/90">Password</p>
                  <p className="text-[10px] text-white/30">Password ••••••••</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-white/50">
                {isSendingReset ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Change
                    <ChevronRight className="w-4 h-4 text-white/30" />
                  </>
                )}
              </div>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Lock className="w-4 h-4 text-[#5ba88a] shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-white/90">Check your email</p>
                  <p className="text-[10px] text-white/40 leading-relaxed">
                    We've sent a secure password reset link to {user?.email}. Follow the link in your email to set a new password.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={isSendingReset}
                className="w-full rounded-xl border border-white/10 py-2.5 text-xs font-medium text-white/50 transition hover:text-white disabled:opacity-40"
              >
                {isSendingReset ? "Resending..." : "Resend reset link"}
              </button>
              <button
                type="button"
                onClick={() => setPasswordStep("idle")}
                className="w-full text-xs text-white/30 hover:text-white/50 transition"
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