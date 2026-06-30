import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, User, Target, Radio, Download, Loader2, Sparkles, Heart, Upload, Trash2, Shield, AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [stackingAlerts, setStackingAlerts] = useState(() => {
    const saved = localStorage.getItem("stacking_alerts_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const [targetLow, setTargetLow] = useState(() => {
    const saved = localStorage.getItem("target_range_low");
    return saved ? parseInt(saved, 10) : 70;
  });
  const [targetHigh, setTargetHigh] = useState(() => {
    const saved = localStorage.getItem("target_range_high");
    return saved ? parseInt(saved, 10) : 180;
  });

const [insulinSensitivity, setInsulinSensitivity] = useState(() => {
  return localStorage.getItem("insulin_sensitivity_mgdl_per_unit") || "";
});

const [unitsPer5g, setUnitsPer5g] = useState(() => {
  return localStorage.getItem("meal_insulin_units_per_5g") || "";
});

const handleInsulinSettingChange = (key, setValue) => (event) => {
  const value = event.target.value;
  setValue(value);

  if (value === "") {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, value);
  }

  window.dispatchEvent(new Event("insulin-settings-updated"));
};

  const isRecommended = targetLow === 70 && targetHigh === 180;

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleLogout = () => {
    base44.auth.logout("/login");
  };

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    // Delete all user data
    const [doses, readings, carbs] = await Promise.all([
    base44.entities.InsulinDose.list("-administered_at", 5000),
    base44.entities.GlucoseReading.list("-recorded_at", 5000),
    base44.entities.CarbEntry.list("-consumed_at", 5000)]
    );
    await Promise.all([
    ...doses.map((d) => base44.entities.InsulinDose.delete(d.id)),
    ...readings.map((r) => base44.entities.GlucoseReading.delete(r.id)),
    ...carbs.map((c) => base44.entities.CarbEntry.delete(c.id))]
    );
    base44.auth.logout("/login");
  };

  const handleStackingToggle = (checked) => {
    setStackingAlerts(checked);
    localStorage.setItem("stacking_alerts_enabled", checked ? "true" : "false");
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
    const filteredDoses = doses.filter((d) => new Date(d.administered_at).getTime() >= cutoff);
    const filteredGlucose = glucose.filter((g) => new Date(g.recorded_at).getTime() >= cutoff);

    let csv = "Type,Value / Units,Insulin Type,Timestamp,Notes\n";
    filteredDoses.forEach((d) => {
      csv += `Insulin,${d.units},"${d.insulin_type}",${d.administered_at},"${d.notes || ""}"\n`;
    });
    filteredGlucose.forEach((g) => {
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

  const handleSteloConnect = () => {
    toast.info("Dexcom Stelo sync requires a backend connection before it can be enabled.");
  };

  const handleAppleHealthImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsSyncing(true);
    toast.info("Processing large file in secure chunks. Please keep this tab open...");

    try {
      // 1. Clear previous glucose readings
      toast.info("Clearing previous readings to prepare for new data...");
      const existingReadings = await base44.entities.GlucoseReading.list("-recorded_at", 5000);
      await Promise.all(existingReadings.map((r) => base44.entities.GlucoseReading.delete(r.id)));

      // 2. Stream and parse the file chunk-by-chunk (16MB slices)
      const chunkSize = 16 * 1024 * 1024;
      let offset = 0;
      let remainder = "";
      let totalSyncedCount = 0;
      let batch = [];
      const batchSize = 500;

      while (offset < file.size) {
        const slice = file.slice(offset, offset + chunkSize);
        const chunkText = await slice.text();
        const textToParse = remainder + chunkText;

        // Ensure we don't parse a cut-off XML element at the chunk boundary
        const lastClosedBracket = textToParse.lastIndexOf('>');
        let processableText = "";
        if (lastClosedBracket !== -1) {
          processableText = textToParse.substring(0, lastClosedBracket + 1);
          remainder = textToParse.substring(lastClosedBracket + 1);
        } else {
          remainder = textToParse;
          offset += chunkSize;
          continue;
        }

        // Extract blood glucose records in this chunk
        const recordRegex = /<Record[^>]*type="HKQuantityTypeIdentifierBloodGlucose"[^>]*>/g;
        const matches = processableText.match(recordRegex) || [];

        for (const record of matches) {
          const valueMatch = record.match(/value="([^"]+)"/);
          const dateMatch = record.match(/startDate="([^"]+)"/);

          if (valueMatch && dateMatch) {
            const val = parseFloat(valueMatch[1]);
            if (!isNaN(val)) {
              batch.push({
                value: val,
                recorded_at: new Date(dateMatch[1]).toISOString(),
                notes: "Synced from Apple Health"
              });

              // Bulk insert in batches to save memory & optimize database performance
              if (batch.length >= batchSize) {
                await base44.entities.GlucoseReading.bulkCreate(batch);
                totalSyncedCount += batch.length;
                batch = [];
              }
            }
          }
        }

        offset += chunkSize;
      }

      // Insert any remaining records in the last batch
      if (batch.length > 0) {
        await base44.entities.GlucoseReading.bulkCreate(batch);
        totalSyncedCount += batch.length;
      }

      if (totalSyncedCount === 0) {
        throw new Error("No blood glucose records found in this export file.");
      }

      toast.success(`Successfully synced ${totalSyncedCount} continuous glucose readings!`);
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
    } catch (err) {
      toast.error(err.message || "Failed to process the XML export.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
<div className="settings-page mx-auto max-w-md space-y-6 pb-12 pt-4">
      {/* Target Range Preference */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Target Range Preference</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 flex gap-4 items-stretch">
          <button
            onClick={handleSetRecommended}
            className={`shrink-0 w-28 py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-center ${
            isRecommended ?
            "bg-teal-500/10 border-teal-500/40 text-white" :
            "bg-white/[0.01] border-white/5 text-white/40 hover:bg-white/[0.03]"}`
            }>
            
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Recommended</div>
            <div className="text-base font-extrabold mt-1">70–180</div>
            <div className="text-[9px] text-white/30 mt-0.5">mg/dL</div>
          </button>

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
              className="cursor-pointer" />
            
            <div className="flex justify-between text-[10px] text-white/20">
              <span>70</span>
              <span>250</span>
            </div>
          </div>
        </div>
      </div>


{/* Insulin Plan */}
<div className="space-y-3">
  <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">
    Insulin Plan
  </h3>

  <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 space-y-5">
    <p className="text-xs text-white/40">
      Enter the values from your established insulin plan.
    </p>

    <div className="space-y-2">
      <Label htmlFor="insulin-sensitivity" className="text-sm font-semibold text-white/90">
        Insulin sensitivity
      </Label>
      <p className="text-xs text-white/40">
        How much 1 unit of insulin typically lowers your glucose.
      </p>
      <div className="flex items-center gap-3">
        <input
          id="insulin-sensitivity"
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          value={insulinSensitivity}
          onChange={handleInsulinSettingChange(
            "insulin_sensitivity_mgdl_per_unit",
            setInsulinSensitivity
          )}
          className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400"
        />
        <span className="text-xs text-white/40">mg/dL per unit</span>
      </div>
    </div>

    <div className="space-y-2">
      <Label htmlFor="meal-insulin" className="text-sm font-semibold text-white/90">
        Meal insulin
      </Label>
      <p className="text-xs text-white/40">
        Insulin units used to cover 5 grams of carbohydrates.
      </p>
      <div className="flex items-center gap-3">
        <input
          id="meal-insulin"
          type="number"
          min="0.05"
          step="0.05"
          inputMode="decimal"
          value={unitsPer5g}
          onChange={handleInsulinSettingChange(
            "meal_insulin_units_per_5g",
            setUnitsPer5g
          )}
          className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-teal-400"
        />
        <span className="text-xs text-white/40">units per 5 g</span>
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
            <Switch checked={stackingAlerts} onCheckedChange={handleStackingToggle} />
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
                <Radio className="w-4 h-4 text-white/40" />
                Dexcom Stelo Biosensor
              </Label>
              <p className="text-sm text-white/40">Automatic CGM sync requires backend support</p>
            </div>
            <button
              onClick={handleSteloConnect}
              className="text-sm font-bold px-4 py-2 rounded-xl border border-white/5 bg-white/5 text-white/80 hover:bg-white/10 transition-all">
              Connect
            </button>
          </div>
        </div>
      </div>

      {/* Apple Health Sync */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Apple Health Sync</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-5 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500" />
              Sync Apple Health Data
            </div>
            <p className="text-xs text-white/40 leading-relaxed">
              Export from iPhone: Health App → Profile → Export All Health Data. Upload the file to replace manual logs with continuous records.
            </p>
          </div>

          <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all group ${
          isSyncing ? "border-teal-500/40 bg-teal-500/[0.02]" : "border-white/10 hover:border-teal-500/40 bg-white/[0.01] hover:bg-teal-500/[0.02]"}`
          }>
            {isSyncing ?
            <Loader2 className="w-6 h-6 text-teal-400 animate-spin mb-2" /> :
            <Upload className="w-6 h-6 text-white/30 group-hover:text-teal-400 mb-2 transition-colors" />
            }
            <span className="text-sm font-medium text-white/70 group-hover:text-white transition-colors">
              {isSyncing ? "Parsing export data..." : "Select export.xml or health.zip"}
            </span>
            <span className="text-xs text-white/30 mt-1">Accepts XML or Zip exports</span>
            <input
              type="file"
              accept=".xml,.zip"
              onChange={handleAppleHealthImport}
              disabled={isSyncing}
              className="hidden" />
            
          </label>
        </div>
      </div>

      {/* Backup & Export */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Backup & Logs</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4">
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="w-full flex items-center justify-between py-1 bg-transparent hover:opacity-80 transition-all text-left">
            
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-teal-400" />
                Export logs as CSV
              </div>
              <p className="text-sm text-white/40">Download insulin & glucose data for past 30 days</p>
            </div>
            {isExporting ?
            <Loader2 className="w-4 h-4 animate-spin text-teal-400" /> :
            <Sparkles className="w-4 h-4 text-teal-400/60" />
            }
          </button>
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white/35 uppercase tracking-wider px-1">Privacy</h3>
        <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-white/90">Your data is private & secure</p>
              <p className="text-xs text-white/40 leading-relaxed">
                All health data logged in Stackd — including glucose readings, insulin doses, and carbohydrate entries — is stored securely and is only accessible by you. We do not share, sell, or transmit your personal health information to any third parties.
              </p>
              <p className="text-xs text-white/40 leading-relaxed">
                Data is encrypted in transit and at rest. You can export or delete your data at any time from this settings page.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Log Out */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-white/5 text-white/50 hover:bg-white/5 hover:text-white/80 transition-all text-sm font-medium">
        
        <LogOut className="w-4 h-4" />
        Log Out
      </button>

      {/* Delete Account */}
      {!showDeleteConfirm ?
      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-red-500/10 text-red-500/50 hover:bg-red-500/5 hover:text-red-400 transition-all text-sm font-medium">
        
          <Trash2 className="w-4 h-4" />
          Delete Account
        </button> :

      <div className="bg-red-950/30 border border-red-500/20 rounded-3xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-300">This action cannot be undone</p>
              <p className="text-xs text-red-400/70 mt-1 leading-relaxed">
                All your data — glucose readings, insulin doses, carbohydrate logs, and account information — will be permanently and irreversibly deleted. There is no way to recover this data.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 text-sm py-3 rounded-2xl border border-white/10 text-white/60 hover:bg-white/5 transition-all text-sm font-medium">
            
              Cancel
            </button>
            <button
  onClick={handleDeleteAccount}
  disabled={isDeletingAccount}
  className="flex-1 text-sm py-3 rounded-2xl bg-red-600/80 hover:bg-red-600 text-white transition-all font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
>{isDeletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : null }{isDeletingAccount ? "Deleting..." : "Yes, Delete Everything"}</button>
          </div>
        </div>
      }
    </div>);

}
