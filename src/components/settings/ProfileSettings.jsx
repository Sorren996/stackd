import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Check, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";

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
    <div className="space-y-6">
      <SectionCard label="Identity">
        {editingName ? (
          <div className="py-3 space-y-3">
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm font-semibold outline-none"
              style={{ background: "#f7f1e8", border: "1px solid #eadccf", color: "#3f3830" }}
              placeholder="Your name"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingName(false);
                  setNameValue(user?.full_name || "");
                }}
                disabled={isSavingName}
                className="text-xs font-medium transition disabled:opacity-40"
                style={{ color: "#6b6153" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveName}
                disabled={isSavingName}
                className="flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-semibold transition active:scale-[0.98] disabled:opacity-40"
                style={{ background: "#3f3830", color: "#f7f1e8" }}
              >
                {isSavingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Save
              </button>
            </div>
          </div>
        ) : (
          <LedgerRow
            label="Name"
            value={user?.full_name || "Not set"}
            actionLabel="Edit"
            onClick={() => {
              setNameValue(user?.full_name || "");
              setEditingName(true);
            }}
          />
        )}
        <LedgerRow label="Email" value={user?.email || "Not available"} />
      </SectionCard>

      <SectionCard label="Security">
        {passwordStep === "idle" ? (
          <LedgerRow
            label="Password"
            value="••••••••"
            actionLabel={isSendingReset ? "Sending..." : "Change"}
            onClick={handleSendPasswordReset}
          />
        ) : (
          <div className="py-3 space-y-3">
            <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>
              We've sent a secure password reset link to {user?.email}. Follow the link in your email to set a new password.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSendPasswordReset}
                disabled={isSendingReset}
                className="text-xs font-medium transition disabled:opacity-40"
                style={{ color: "#6b6153" }}
              >
                {isSendingReset ? "Resending..." : "Resend link"}
              </button>
              <button
                type="button"
                onClick={() => setPasswordStep("idle")}
                className="text-xs font-medium transition"
                style={{ color: "#746959" }}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <p className="text-xs" style={{ color: "#746959" }}>
          Your identity stays private. <span className="font-serif-italic">Only you see these details.</span>
        </p>
      </SectionCard>
    </div>
  );
}