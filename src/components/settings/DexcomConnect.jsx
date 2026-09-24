import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, HeartPulse, Unlink, Sparkles, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import DexcomSyncStatus from "@/components/DexcomSyncStatus";
import SectionCard from "@/components/editorial/SectionCard";

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
      <SectionCard label="Glucose Source">
        <div className="pt-3 pb-2">
          <p className="text-xs leading-relaxed mb-4" style={{ color: "#6b6153" }}>
            Connect your Dexcom account so your readings flow into Stackd gently and automatically — no manual logging required.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#746959" }} />
            </div>
          ) : isConnected ? (
            <div className="space-y-4">
              {hasDexcomData ? (
                <div className="flex items-center gap-2 rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(91,101,80,0.20)", background: "rgba(91,101,80,0.08)" }}>
                  <Sparkles className="h-4 w-4" style={{ color: "#4d5742" }} />
                  <p className="text-xs font-medium" style={{ color: "#4d5742" }}>
                    Connected and flowing. Your glucose rhythm is syncing peacefully.
                  </p>
                </div>
              ) : (
                <DexcomSyncStatus />
              )}
              {current?.last_sync_error && (
                <div className="flex items-start gap-2 rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(175,117,27,0.20)", background: "rgba(175,117,27,0.08)" }}>
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#8a5a12" }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium" style={{ color: "#8a5a12" }}>
                      Last sync couldn't reach Dexcom
                    </p>
                    <p className="text-[11px] mt-0.5 leading-relaxed break-words" style={{ color: "#8a5a12", opacity: 0.6 }}>
                      {current.last_sync_error}
                    </p>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border transition-all text-sm font-medium disabled:opacity-40"
                style={{ borderColor: "#eadccf", background: "#f7f1e8", color: "#6b6153" }}
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {hasError && (
                <div className="flex items-start gap-2 rounded-2xl border px-4 py-3" style={{ borderColor: "rgba(201,112,96,0.20)", background: "rgba(201,112,96,0.08)" }}>
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#9c3f2e" }} />
                  <p className="text-xs font-medium leading-relaxed" style={{ color: "#9c3f2e" }}>
                    Your last sync couldn't reach Dexcom. Please re-enter your credentials to reconnect.
                  </p>
                </div>
              )}

              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "#6b6153" }}>Dexcom username or email</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your Dexcom account email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none"
                  style={{ background: "#f7f1e8", borderColor: "#eadccf", color: "#3f3830" }}
                />
              </div>

              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "#6b6153" }}>Dexcom password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your Dexcom account password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="w-full rounded-2xl border px-4 py-3 pr-11 text-sm focus:outline-none"
                    style={{ background: "#f7f1e8", borderColor: "#eadccf", color: "#3f3830" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition"
                    style={{ color: "#746959" }}
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
      </SectionCard>

      <SectionCard>
        <div className="flex items-start gap-2">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#746959" }} />
          <p className="text-xs leading-relaxed" style={{ color: "#746959" }}>
            Your Dexcom username and password are stored privately and used only to read your glucose readings.
            They are never visible to other users, admins, or support staff. Disconnecting permanently deletes them.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}