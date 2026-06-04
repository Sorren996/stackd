import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut, User, Target, Bell, Radio, Download, Loader2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [stackingAlerts, setStackingAlerts] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [steloConnected, setSteloConnected] = useState(false);
  const [connectingStelo, setConnectingStelo] = useState(false);

  const [targetLow, setTargetLow] = useState(() => {
    const saved = localStorage.getItem("target_range_low");
    return saved ? parseInt(saved, 10) : 70;
  });
  const [targetHigh, setTargetHigh] = useState(() => {
    const saved = localStorage.getItem("target_range_high");
    return saved ? parseInt(saved, 10) : 180;
  });
  const isRecommended = targetLow === 70 && targetHigh === 180;

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = () => {
    base44.auth.logout("/login");
  };

  const handleSetRecommended = () => {
    setTargetLow(70);
    setTargetHigh(180);
    localStorage.setItem("target_range_low", "70");
    localStorage.setItem("target_range_high", "180");
    toast.success("Set to recommended range (70–180 mg/dL)");
  };

  const handleSliderChange = ([low, high]) => {
    setTargetLow(low);
    setTargetHigh(high);
    localStorage.setItem("target_range_low", low.toString());
    localStorage.setItem("target_range_high", high.toString());
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    const doses = await base44.entities.InsulinDose.list("-administered_at", 1000);
    const glucose = await base44.entities.GlucoseReading.list("-recorded_at", 1000);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const filteredDoses = doses.filter(d => new Date(d.administered_at).getTime() >= cutoff);
    const filteredGlucose = glucose.filter(g => new Date(g.recorded_at).getTime() >= cutoff);

    let csv = "Type,Value / Units,Insulin Type,Timestamp,Notes\n";
    filteredDoses.forEach(d => {
      csv += `Insulin,${d.units},"${d.insulin_type}",${d.administered_at},"${d.notes || ""}"\n`;
    });
    filteredGlucose.forEach(g => {
      csv += `Glucose,${g.value},,${g.recorded_at},"${g.notes || ""}"\n`;
    });

    const link = document.createElement("a");
    link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
    link.download = `stackd_30day_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExporting(false);
    toast.success("Exported 30 days of data!");
  };

  const handleSteloToggle = () => {
    if (steloConnected) {
      setSteloConnected(false);
      toast.success("Disconnected from Dexcom Stelo");
      return;
    }
    setConnectingStelo(true);
    setTimeout(() => {
      setConnectingStelo(false);
      setSteloConnected(true);
      toast.success("Connected to Dexcom Stelo Biosensor!");
    }, 2200);
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pt-4 pb-12">
      {/* Profile Card */}
      <div className="flex flex-col items-center text-center p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
        <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mb-3">
          <User className="w-8 h-8 text-teal-400" />
        </div>
        <h2 className="text-lg font-bold text-white">{user?.full_name || "User"}</h2>
        <p className="text-sm text-white/40 mt-0.5">{user?.email}</p>
      </div>

      {/* Target Range Preference */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Target Range Preference</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 flex gap-4 items-stretch">
          {/* Recommended preset button */}
          <button
            onClick={handleSetRecommended}
            className={`shrink-0 w-28 py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-center ${
              isRecommended
                ? "bg-teal-500/10 border-teal-500/40 text-white"
                : "bg-white/[0.01] border-white/5 text-white/40 hover:bg-white/[0.03]"
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Recommended</div>
            <div className="text-base font-extrabold mt-1">70–180</div>
            <div className="text-[9px] text-white/30 mt-0.5">mg/dL</div>
          </button>

          {/* Custom range slider */}
          <div className="flex-1 flex flex-col justify-center space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Custom Range</span>
              <span className="text-sm font-bold text-teal-400">{targetLow}–{targetHigh} mg/dL</span>
            </div>
            <Slider
              min={70}
              max={250}
              step={5}
              value={[targetLow, targetHigh]}
              onValueChange={handleSliderChange}
              className="cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-white/20">
              <span>70</span>
              <span>250</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts & Preferences */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Alerts & Preferences</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Target className="w-4 h-4 text-teal-400" />
                Insulin Stacking Warnings
              </Label>
              <p className="text-sm text-white/40">Alert when multiple rapid doses overlap</p>
            </div>
            <Switch checked={stackingAlerts} onCheckedChange={setStackingAlerts} />
          </div>

        </div>
      </div>

      {/* Hardware Integrations */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Hardware Integrations</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold text-white/90 flex items-center gap-2">
                <Radio className={`w-4 h-4 ${steloConnected ? "text-teal-400 animate-pulse" : "text-white/40"}`} />
                Dexcom Stelo Biosensor
              </Label>
              <p className="text-sm text-white/40">Sync CGM data automatically (coming soon)</p>
            </div>
            <button
              onClick={handleSteloToggle}
              disabled={connectingStelo}
              className={`text-sm font-bold px-4 py-2 rounded-xl border transition-all ${
                steloConnected
                  ? "bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20"
                  : "bg-white/5 border-white/5 text-white/80 hover:bg-white/10"
              }`}
            >
              {connectingStelo ? (
                <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Syncing...</span>
              ) : steloConnected ? "Connected" : "Connect"}
            </button>
          </div>
        </div>
      </div>

      {/* Backup & Export */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Backup & Logs</h3>
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
              <p className="text-sm text-white/40">Download insulin & glucose data for past 30 days</p>
            </div>
            {isExporting
              ? <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              : <Sparkles className="w-4 h-4 text-teal-400/60" />
            }
          </button>
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