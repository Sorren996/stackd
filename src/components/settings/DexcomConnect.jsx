import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, HeartPulse, Link2, Unlink, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function DexcomConnect() {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const { data: connection, isLoading } = useQuery({
    queryKey: ["dexcom-connection"],
    queryFn: () => base44.entities.DexcomConnection.list("-created_date", 1),
  });

  const current = connection?.[0];
  const isConnected = current?.status === "connected";

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke("getDexcomAuthUrl", {});
      window.location.href = res.data.authUrl;
    } catch {
      toast.error("We couldn't start the connection. Please try again.");
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await base44.entities.DexcomConnection.deleteMany({});
      queryClient.invalidateQueries(["dexcom-connection"]);
      toast.success("Glucose source disconnected. Your readings stay yours.");
    } catch {
      toast.error("Something didn't go as expected. Please try again.");
      setDisconnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-3xl border p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-500/20 bg-teal-500/10">
            <HeartPulse className="h-5 w-5 text-teal-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Glucose Source</p>
            <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
              Connect a continuous glucose source so your readings flow into Stackd
              gently and automatically — no manual logging required.
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
              <div className="flex items-center gap-2 rounded-2xl border border-teal-500/20 bg-teal-500/10 px-4 py-3">
                <Sparkles className="h-4 w-4 text-teal-300" />
                <p className="text-xs text-teal-200 font-medium">
                  Connected and flowing. Your glucose rhythm is syncing peacefully.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-white/10 text-white/60 hover:bg-white/5 hover:text-white/80 transition-all text-sm font-medium disabled:opacity-40"
              >
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[hsl(var(--chart-1))] text-white font-medium text-sm hover:opacity-90 transition-all disabled:opacity-40"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {connecting ? "Opening secure connection..." : "Connect your glucose source"}
            </button>
          )}
        </div>
      </div>

      <p className="px-2 text-xs text-white/30 leading-relaxed">
        We use a secure, private connection. Your credentials stay with your source —
        Stackd only receives permission to read your glucose readings.
      </p>
    </div>
  );
}