import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, HeartPulse, Unlink, Sparkles, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import DexcomSyncStatus from "@/components/DexcomSyncStatus";

export default function DexcomConnect() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["dexcom-connection"],
    queryFn: () => base44.entities.DexcomConnection.list("-created_date", 1),
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const current = connection?.[0];
  const isConnected = current?.status === "connected";
  const hasError = current?.status === "error";

  const { data: latestDexcom = [] } = useQuery({
    queryKey: ["latest-dexcom-glucose"],
    queryFn: () => base44.entities.GlucoseReading.filter({ source: { $in: ["dexcom", "dexcom_share"] } }, "-recorded_at", 1),
    enabled: isConnected,
    staleTime: 60 * 1000,
  });
  const hasDexcomData = latestDexcom.length > 0;

  const handleConnect = async () => {
    if (!username.trim() || !password) {
      toast.error("Please enter your Dexcom username and password.");
      return;
    }
    setConnecting(true);
    try {
      await base44.functions.invoke("connectDexcomShare", {
        username: username.trim(),
        password: password,
      });
      queryClient.invalidateQueries(["dexcom-connection"]);
      toast.success("Connected — your glucose readings will begin flowing in gently.");
      setUsername("");
      setPassword("");
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "We couldn't connect. Please check your credentials.";
      toast.error(msg);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await base44.entities.DexcomConnection.deleteMany({});
      queryClient.invalidateQueries(["dexcom-connection"]);
      toast.success("Glucose source disconnected. Your Dexcom credentials have been removed.");
    } catch {
      toast.error("Something didn't go as expected. Please try again.");
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-3xl border p-5" style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}>
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border" style={{ borderColor: "rgba(91,101,80,0.20)", background: "rgba(91,101,80,0.08)" }}>
            <HeartPulse className="h-5 w-5" style={{ color: "#5b6550" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Glucose Source</p>
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
              Connect your Dexcom account so your readings flow into Stackd gently and automatically — no manual logging required.
            </p>
          </div>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-3 text-white/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : isConnected ? (
            <div className="space-y-4">
              {hasDexcomData ? (
                <div className="flex items-center gap-2 rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(91,101,80,0.20)", background: "rgba(91,101,80,0.08)" }}>
                  <Sparkles className="h-4 w-4" style={{ color: "#5b6550" }} />
                  <p className="text-xs font-medium" style={{ color: "#5b6550" }}>
                    Connected and flowing. Your glucose rhythm is syncing peacefully.
                  </p>
                </div>
              ) : (
                <DexcomSyncStatus />
              )}
              {current?.last_sync_error && (
                <div className="flex items-start gap-2 rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(175,117,27,0.20)", background: "rgba(175,117,27,0.08)" }}>
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#af751b" }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: "#af751b" }}>
                      Last sync couldn't reach Dexcom
                    </p>
                    <p className="text-[11px] mt-0.5 leading-relaxed break-words" style={{ color: "#af751b", opacity: 0.6 }}>
                      {current.last_sync_error}
                    </p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border text-white/60 hover:text-white/80 transition-all text-sm font-medium disabled:opacity-40"
                style={{ borderColor: "#eadccf", background: "#f7f1e8" }}
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {hasError && (
                <div className="flex items-start gap-2 rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(201,112,96,0.20)", background: "rgba(201,112,96,0.08)" }}>
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#c97060" }} />
                  <p className="text-xs font-medium leading-relaxed" style={{ color: "#c97060" }}>
                    Your last sync couldn't reach Dexcom. Please re-enter your credentials to reconnect.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Dexcom username or email</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your Dexcom account email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full rounded-2xl border px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none"
                  style={{ background: "#f7f1e8", borderColor: "#eadccf" }}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/50 mb-1.5 block">Dexcom password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your Dexcom account password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full rounded-2xl border px-4 py-3 pr-11 text-sm text-white placeholder:text-white/30 focus:outline-none"
                    style={{ background: "#f7f1e8", borderColor: "#eadccf" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting || !username.trim() || !password}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-medium text-sm hover:opacity-90 transition-all disabled:opacity-40"
                style={{ background: "#3f3830", color: "#f7f1e8" }}
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HeartPulse className="h-4 w-4" />}
                {connecting ? "Connecting..." : "Connect your glucose source"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 px-2">
        <Lock className="h-3.5 w-3.5 text-white/25 shrink-0 mt-0.5" />
        <p className="text-xs text-white/30 leading-relaxed">
          Your Dexcom username and password are stored privately and used only to read your glucose readings.
          They are never visible to other users, admins, or support staff. Disconnecting permanently deletes them.
        </p>
      </div>
    </div>
  );
}