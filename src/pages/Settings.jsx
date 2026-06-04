import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut, User, Target, Bell, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [stackingAlerts, setStackingAlerts] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = () => {
    base44.auth.logout("/login");
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pt-4 pb-12">
      {/* Profile Card */}
      <div className="flex flex-col items-center text-center p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
        <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-3">
          <User className="w-8 h-8 text-teal-400" />
        </div>
        <h2 className="text-lg font-bold text-white">{user?.full_name || "User"}</h2>
        <p className="text-xs text-white/40 mt-0.5">{user?.email}</p>
      </div>

      {/* Alerts & Preferences */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-white/35 uppercase tracking-wider px-1">Alerts & Preferences</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Target className="w-4 h-4 text-teal-400" />
                Insulin Stacking Warnings
              </Label>
              <p className="text-xs text-white/40">Alert when multiple rapid doses overlap</p>
            </div>
            <Switch checked={stackingAlerts} onCheckedChange={setStackingAlerts} />
          </div>

         {/* Dexter Stelo Integration */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-white/35 uppercase tracking-wider px-1 font-sans">Hardware Integrations</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Radio className={`w-4 h-4 ${steloConnected ? "text-teal-400 animate-pulse" : "text-white/40"}`} />
                Dexcom Stelo Biosensor
              </Label>
              <p className="text-xs text-white/40">Connect via bluetooth to sync CGM data automatically</p>
            </div>
            <button
              onClick={handleSteloToggle}
              disabled={connectingStelo}
              className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all ${
                steloConnected 
                  ? "bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20" 
                  : "bg-white/5 border-white/5 text-white/80 hover:bg-white/10"
              }`}
            >
              {connectingStelo ? (
                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</span>
              ) : steloConnected ? (
                "Connected"
              ) : (
                "Connect"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Export & Logs */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-white/35 uppercase tracking-wider px-1">Backup & Logs</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4">
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="w-full flex items-center justify-between py-1 bg-transparent hover:opacity-80 transition-all text-left"
          >
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-teal-400" />
                Export logs as CSV
              </div>
              <p className="text-xs text-white/40">Download insulin doses & glucose data for past 30 days</p>
            </div>
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin text-teal-400" /> : <Sparkles className="w-4 h-4 text-teal-400/60" />}
          </button>
        </div>
      </div>

          
        </div>
      </div>

      {/* Log Out */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-red-500/10 text-red-500/70 hover:bg-red-500/5 hover:text-red-400 transition-all text-sm font-medium"
      >
        <LogOut className="w-4 h-4" />
        Log Out
      </button>
    </div>
  );
}