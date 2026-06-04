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

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Bell className="w-4 h-4 text-teal-400" />
                Reminders
              </Label>
              <p className="text-xs text-white/40">Remind to log glucose after meals</p>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-400" />
                High Contrast Gauges
              </Label>
              <p className="text-xs text-white/40">Enhance dashboard visibility</p>
            </div>
            <Switch checked={highContrast} onCheckedChange={setHighContrast} />
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