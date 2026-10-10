import { useState } from "react";
import { ChevronLeft, HeartPulse, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const INK = "#3f3830";
const CREAM = "#fdf9f2";
const CANVAS = "#f7f1e8";
const HAIRLINE = "#eadccf";
const FAINT = "#746959";
const TAUPE = "#6b6153";

/**
 * Step 3 — Dexcom Connection (optional, skippable).
 * Offers the existing Dexcom Share connect form, or "I'll do this later."
 * Skipped users land on the dashboard with the existing connect prompt.
 */
export default function DexcomConnectStep({ onComplete, onBack, completing }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const queryClient = useQueryClient();

  const handleConnect = async () => {
    if (!username.trim() || !password) return;
    setConnecting(true);
    try {
      const res = await base44.functions.invoke("connectDexcomShare", {
        username: username.trim(),
        password,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      queryClient.invalidateQueries(["dexcom-connection"]);
      toast.success("Connected. Your readings will begin flowing in gently.");
      onComplete();
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.data?.error ||
        err?.message ||
        "Couldn't connect. Check your username and password.";
      toast.error(msg);
      setConnecting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: CANVAS }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: CREAM, border: `1px solid ${HAIRLINE}` }}
        >
          <ChevronLeft className="h-4 w-4" style={{ color: INK }} />
        </button>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: FAINT }}>
          Step 3 of 3
        </p>
      </div>

      {/* Title */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold" style={{ color: INK }}>
          Your{" "}
          <em style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 400 }}>
            glucose source
          </em>
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: TAUPE }}>
          Connect your Dexcom account so readings flow in automatically, or do this later.
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: CREAM, border: `1px solid ${HAIRLINE}` }}
        >
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: TAUPE }}>
              Dexcom username or email
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Your Dexcom account email"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none"
              style={{ background: CANVAS, borderColor: HAIRLINE, color: INK }}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: TAUPE }}>
              Dexcom password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your Dexcom account password"
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full rounded-2xl border px-4 py-3 pr-11 text-sm focus:outline-none"
                style={{ background: CANVAS, borderColor: HAIRLINE, color: INK }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: FAINT }}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 px-1">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: FAINT }} />
          <p className="text-[11px] leading-relaxed" style={{ color: FAINT }}>
            Your Dexcom credentials are stored encrypted and are accessible only by the automated sync
            service. They cannot be read by anyone.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div
        className="shrink-0 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] space-y-2.5"
        style={{ borderTop: `1px solid ${HAIRLINE}` }}
      >
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting || !username.trim() || !password}
          className="w-full flex items-center justify-center gap-2 rounded-full py-3.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: INK, color: CREAM }}
        >
          {connecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <HeartPulse className="h-4 w-4" />
          )}
          {connecting ? "Connecting..." : "Connect your glucose source"}
        </button>
        <button
          type="button"
          onClick={onComplete}
          disabled={completing}
          className="w-full flex items-center justify-center gap-2 rounded-full py-3 text-sm font-medium transition disabled:opacity-40"
          style={{ color: TAUPE }}
        >
          {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {completing ? "Finishing up..." : "I'll do this later"}
        </button>
      </div>
    </div>
  );
}