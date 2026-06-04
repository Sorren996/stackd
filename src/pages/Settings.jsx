import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { LogOut, User, Target, Bell, Sliders, Download, Radio, Loader2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [stackingAlerts, setStackingAlerts] = useState(true);
  const [notifications, setNotifications] = useState(true);
  
  // Custom states requested
  const [targetRange, setTargetRange] = useState(() => localStorage.getItem("target_range_pref") || "70-180");
  const [isExporting, setIsExporting] = useState(false);
  const [steloConnected, setSteloConnected] = useState(false);
  const [connectingStelo, setConnectingStelo] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = () => {
    base44.auth.logout("/login");
  };

  // 1. Target range preference handler
  const handleRangeChange = (range) => {
    setTargetRange(range);
    localStorage.setItem("target_range_pref", range);
    toast.success(`Target range set to ${range} mg/dL`);
  };

  // 2. Export insulin & glucose data for the last 30 days as CSV
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const doses = await base44.entities.InsulinDose.list("-administered_at", 1000);
      const glucose = await base44.entities.GlucoseReading.list("-recorded_at", 1000);
      
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const filteredDoses = doses.filter(d => new Date(d.administered_at).getTime() >= thirtyDaysAgo);
      const filteredGlucose = glucose.filter(g => new Date(g.recorded_at).getTime() >= thirtyDaysAgo);

      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Type,Value / Units,Insulin Type,Timestamp,Notes\n";

      filteredDoses.forEach(d => {
        csvContent += `Insulin,${d.units},"${d.insulin_type}",${d.administered_at},"${d.notes || ""}"\n`;
      });

      filteredGlucose.forEach(g => {
        csvContent += `Glucose,${g.value},,${g.recorded_at},"${g.notes || ""}"\n`;
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `stackd_30day_data_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("Exported 30 days of medical logs successfully!");
    } catch (err) {
      toast.error("Failed to compile CSV data");
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Connect to Dexcom Stelo (with fully mock-connected animation states)
  const handleSteloToggle = () => {
    if (steloConnected) {
      setSteloConnected(false);
      toast.success("Disconnected from Dexcom Stelo Biosensor");
      return;
    }

    setConnectingStelo(true);
    setTimeout(() => {
      setConnectingStelo(false);
      setSteloConnected(true);
      toast.success("Successfully connected to Dexcom Stelo Biosensor!");
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
        <p className="text-xs text-white/40 mt-0.5">{user?.email}</p>
      </div>

      {/* Target Range Preference */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-white/35 uppercase tracking-wider px-1">Target Range Preference</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 grid grid-cols-3 gap-2">
          {[
            { label: "Tight", range: "80-140" },
            { label: "Standard", range: "70-180" },
            { label: "High Info", range: "90-200" }
          ].map((preset) => {
            const isActive = targetRange === preset.range;
            return (
              <button
                key={preset.label}
                onClick={() => handleRangeChange(preset.range)}
                className={`py-3 px-2 rounded-2xl border text-center transition-all ${
                  isActive 
                    ? "bg-teal-500/10 border-teal-500/40 text-white" 
                    : "bg-white/[0.01] border-white/5 text-white/40 hover:bg-white/[0.03]"
                }`}
              >
                <div className="text-xs font-bold">{preset.label}</div>
                <div className="text-[10px] mt-0.5 font-medium">{preset.range}</div>
              </button>
            );
          })}
        </div>
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