import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Target, Info, Loader2, Check } from "lucide-react";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { AnimatePresence, motion } from "framer-motion";
import { useUserSettings } from "@/hooks/useUserSettings";
import { toast } from "sonner";

const INSULIN_PLAN_HELP = {
  review: {
    title: "Meal review",
    body: "How long after a meal the app should keep reviewing that grouped meal. The insulin:carb card uses this window to decide whether a recent meal is still relevant and to inspect post-meal glucose readings.",
  },
  pre: {
    title: "Pre-meal insulin",
    body: "How far before the first carb log an insulin dose can still be paired with that meal. If you usually pre-bolus 10-20 minutes before eating, this should be at least that long.",
  },
  post: {
    title: "Post-meal insulin",
    body: "How far after the last carb log an insulin dose can still be paired with that meal. This helps catch doses logged after eating or split meal boluses.",
  },
  types: {
    title: "Meal insulin types",
    body: "Select only insulin types used for meals or corrections. Basal insulin such as Lantus, Levemir, or Tresiba should usually stay off so it does not count toward meal coverage.",
  },
};

function getDefaultMealInsulinTypes() {
  return Object.entries(INSULIN_PROFILES)
    .filter(([, profile]) => ["Rapid-Acting", "Short-Acting"].includes(profile.category))
    .map(([name]) => name);
}

function readMealInsulinTypes() {
  try {
    const parsed = JSON.parse(localStorage.getItem("meal_insulin_types") || "null");
    return Array.isArray(parsed) && parsed.length ? parsed : getDefaultMealInsulinTypes();
  } catch {
    return getDefaultMealInsulinTypes();
  }
}

function SettingHelpButton({ id, openHelp, setOpenHelp }) {
  const help = INSULIN_PLAN_HELP[id];
  if (!help) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpenHelp(openHelp === id ? null : id);
      }}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
        openHelp === id
          ? "border-teal-400/40 bg-teal-500/10 text-teal-300"
          : "border-white/10 bg-white/5 text-white/35 hover:text-teal-300"
      }`}
      aria-label={`${help.title} help`}
    >
      <Info className="h-3 w-3" />
    </button>
  );
}

function SettingsHelpOverlay({ openHelp, onClose }) {
  const [visibleHelp, setVisibleHelp] = useState(openHelp);
  const help = INSULIN_PLAN_HELP[visibleHelp];

  useEffect(() => {
    if (openHelp) setVisibleHelp(openHelp);
  }, [openHelp]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence mode="wait" onExitComplete={() => setVisibleHelp(null)}>
      {openHelp && help && (
        <motion.div
          key="settings-help-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-[999] bg-black/45"
          onClick={onClose}
        >
          <motion.div
            key={openHelp}
            initial={{ opacity: 0, y: 34, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 460, damping: 32, mass: 0.85 }}
            className="fixed bottom-24 left-4 right-4 mx-auto w-auto max-w-sm rounded-2xl border border-white/10 bg-[hsl(162,10%,10%)] p-4 text-left shadow-2xl sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-24 sm:w-full sm:-translate-x-1/2"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white">{help.title}</p>
              <button
                type="button"
                onClick={onClose}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/35"
                aria-label="Close help"
              >
                x
              </button>
            </div>
            <p className="text-xs leading-relaxed text-white/55">{help.body}</p>
            <p className="mt-2 text-[10px] leading-relaxed text-white/30">
              This is for app estimates only and is not dosing advice.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function CustomInputTray({ open, onClose, title, children, anchorRef }) {
  const prevOverflowRef = useRef("");

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    if (anchorRef?.current) {
      anchorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    prevOverflowRef.current = document.body.style.overflow;
    const lockTimeout = setTimeout(() => {
      document.body.style.overflow = "hidden";
    }, 400);

    return () => {
      clearTimeout(lockTimeout);
      document.body.style.overflow = prevOverflowRef.current;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const absorb = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1000] bg-black/25"
        onPointerDown={absorb}
        onPointerUp={absorb}
        onClick={(event) => {
          absorb(event);
          onClose();
        }}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[1001] min-h-[34dvh] rounded-t-3xl border border-white/10 bg-[hsl(162,10%,8%)] px-4 pb-[max(env(safe-area-inset-bottom),0.85rem)] pt-3 shadow-[0_-24px_60px_rgba(0,0,0,0.55)]"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white/60">{title}</p>
          <button
            type="button"
            onClick={(event) => {
              absorb(event);
              onClose();
            }}
            className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-teal-200"
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body
  );
}

function NumberPadField({ label, value, onChange, placeholder = "--", decimal = true, maxLength = 6, className = "" }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const textValue = value === undefined || value === null ? "" : String(value);
  const press = (key) => {
    if (key === "clear") return onChange("");
    if (key === "back") return onChange(textValue.slice(0, -1));
    if (key === "." && (!decimal || textValue.includes("."))) return;
    if (textValue.length >= maxLength) return;
    onChange(`${textValue}${key}`);
  };

  return (
    <div ref={fieldRef} className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2 ${className}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-10 w-full flex-col items-start justify-center gap-0.5 text-left">
        <span className="max-w-full truncate text-base font-bold leading-tight text-white">{textValue || placeholder}</span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label} anchorRef={fieldRef}>
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "clear", "0", "back"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                press(key);
              }}
              className="h-14 rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-bold text-white/85 transition hover:bg-white/10 active:scale-[0.98]"
            >
              {key === "back" ? "Back" : key === "clear" ? "Clear" : key}
            </button>
          ))}
        </div>
      </CustomInputTray>
    </div>
  );
}

export default function InsulinSettings() {
  const { settings: serverSettings, isSaving, saveError, saveSuccess, save: saveSettings } = useUserSettings();
  const [openHelp, setOpenHelp] = useState(null);

  const [stackingAlerts, setStackingAlerts] = useState(() => {
    const saved = localStorage.getItem("stacking_alerts_enabled");
    return saved !== null ? saved === "true" : true;
  });

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

  const [correctionTargetGlucose, setCorrectionTargetGlucose] = useState(() => {
    return localStorage.getItem("correction_target_glucose") || "110";
  });

  const [unitsPer5g, setUnitsPer5g] = useState(() => {
    return localStorage.getItem("meal_insulin_units_per_5g") || "";
  });

  const [mealInsulinTypes, setMealInsulinTypes] = useState(readMealInsulinTypes);

  const [preMealWindowMinutes, setPreMealWindowMinutes] = useState(() => {
    return localStorage.getItem("meal_prebolus_window_minutes") || "45";
  });

  const [postMealWindowMinutes, setPostMealWindowMinutes] = useState(() => {
    return localStorage.getItem("meal_postbolus_window_minutes") || "90";
  });

  const [outcomeWindowMinutes, setOutcomeWindowMinutes] = useState(() => {
    return localStorage.getItem("meal_outcome_window_minutes") || "240";
  });

  // Load settings from server when available — server is authoritative, not local storage
  useEffect(() => {
    if (!serverSettings) return;

    if (serverSettings.target_range_low != null) {
      setTargetLow(serverSettings.target_range_low);
      localStorage.setItem("target_range_low", String(serverSettings.target_range_low));
    }
    if (serverSettings.target_range_high != null) {
      setTargetHigh(serverSettings.target_range_high);
      localStorage.setItem("target_range_high", String(serverSettings.target_range_high));
    }
    if (serverSettings.insulin_sensitivity_mgdl_per_unit != null) {
      setInsulinSensitivity(String(serverSettings.insulin_sensitivity_mgdl_per_unit));
      localStorage.setItem("insulin_sensitivity_mgdl_per_unit", String(serverSettings.insulin_sensitivity_mgdl_per_unit));
    }
    if (serverSettings.correction_target_glucose != null) {
      setCorrectionTargetGlucose(String(serverSettings.correction_target_glucose));
      localStorage.setItem("correction_target_glucose", String(serverSettings.correction_target_glucose));
    }
    if (serverSettings.meal_insulin_units_per_5g != null) {
      setUnitsPer5g(String(serverSettings.meal_insulin_units_per_5g));
      localStorage.setItem("meal_insulin_units_per_5g", String(serverSettings.meal_insulin_units_per_5g));
    }
    if (Array.isArray(serverSettings.meal_insulin_types) && serverSettings.meal_insulin_types.length) {
      setMealInsulinTypes(serverSettings.meal_insulin_types);
      localStorage.setItem("meal_insulin_types", JSON.stringify(serverSettings.meal_insulin_types));
    }
    if (serverSettings.meal_prebolus_window_minutes != null) {
      setPreMealWindowMinutes(String(serverSettings.meal_prebolus_window_minutes));
      localStorage.setItem("meal_prebolus_window_minutes", String(serverSettings.meal_prebolus_window_minutes));
    }
    if (serverSettings.meal_postbolus_window_minutes != null) {
      setPostMealWindowMinutes(String(serverSettings.meal_postbolus_window_minutes));
      localStorage.setItem("meal_postbolus_window_minutes", String(serverSettings.meal_postbolus_window_minutes));
    }
    if (serverSettings.meal_outcome_window_minutes != null) {
      setOutcomeWindowMinutes(String(serverSettings.meal_outcome_window_minutes));
      localStorage.setItem("meal_outcome_window_minutes", String(serverSettings.meal_outcome_window_minutes));
    }
    if (typeof serverSettings.stacking_alerts_enabled === "boolean") {
      setStackingAlerts(serverSettings.stacking_alerts_enabled);
      localStorage.setItem("stacking_alerts_enabled", serverSettings.stacking_alerts_enabled ? "true" : "false");
    }

    window.dispatchEvent(new Event("target-range-updated"));
    window.dispatchEvent(new Event("insulin-settings-updated"));
  }, [serverSettings]);

  const handleSaveSettings = () => {
    saveSettings({
      insulin_sensitivity_mgdl_per_unit: insulinSensitivity === "" ? undefined : Number(insulinSensitivity),
      correction_target_glucose: correctionTargetGlucose === "" ? undefined : Number(correctionTargetGlucose),
      meal_insulin_units_per_5g: unitsPer5g === "" ? undefined : Number(unitsPer5g),
      meal_insulin_types: mealInsulinTypes,
      meal_prebolus_window_minutes: preMealWindowMinutes === "" ? undefined : Number(preMealWindowMinutes),
      meal_postbolus_window_minutes: postMealWindowMinutes === "" ? undefined : Number(postMealWindowMinutes),
      meal_outcome_window_minutes: outcomeWindowMinutes === "" ? undefined : Number(outcomeWindowMinutes),
      target_range_low: targetLow,
      target_range_high: targetHigh,
      stacking_alerts_enabled: stackingAlerts,
    });
  };

  const handleInsulinSettingValueChange = (key, setValue) => (value) => {
    setValue(value);

    if (value === "") {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }

    window.dispatchEvent(new Event("insulin-settings-updated"));
  };

  const dispatchTargetRangeUpdated = () => {
    window.dispatchEvent(new Event("target-range-updated"));
    window.dispatchEvent(new Event("insulin-settings-updated"));
  };

  const toggleMealInsulinType = (name) => {
    setMealInsulinTypes((current) => {
      const next = current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name];
      const saved = next.length ? next : getDefaultMealInsulinTypes();

      localStorage.setItem("meal_insulin_types", JSON.stringify(saved));
      window.dispatchEvent(new Event("insulin-settings-updated"));
      return saved;
    });
  };

  const isRecommended = targetLow === 70 && targetHigh === 180;

  const handleStackingToggle = (checked) => {
    setStackingAlerts(checked);
    localStorage.setItem("stacking_alerts_enabled", checked ? "true" : "false");
  };

  const handleSetRecommended = () => {
    setTargetLow(70);
    setTargetHigh(180);
    localStorage.setItem("target_range_low", "70");
    localStorage.setItem("target_range_high", "180");
    dispatchTargetRangeUpdated();
    toast.success("Set to recommended range (70–180 mg/dL)");
  };

  const handleSliderChange = ([low, high]) => {
    setTargetLow(low);
    setTargetHigh(high);
    localStorage.setItem("target_range_low", low.toString());
    localStorage.setItem("target_range_high", high.toString());
    dispatchTargetRangeUpdated();
  };

  return (
    <>
      <SettingsHelpOverlay openHelp={openHelp} onClose={() => setOpenHelp(null)} />

      <div className="space-y-6">
        {/* Target Range Preference */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Target Range Preference</h3>
          <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-3xl p-4 flex gap-4 items-stretch">
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

        {/* Alerts & Preferences */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">Alerts & Preferences</h3>
          <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-3xl p-4 space-y-5">
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

        {/* Insulin Plan */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">
            Insulin Plan
          </h3>

          <div className="backdrop-blur-sm bg-white/[0.02] border border-white/10 rounded-3xl p-4 space-y-5">
            <p className="text-xs text-white/40">
              Enter only insulin settings prescribed or confirmed by your licensed healthcare professional. This app does not provide medical advice, verify dosing accuracy, or replace clinical judgment. Incorrect values may result in serious hypoglycemia or hyperglycemia. Do not start, stop, or adjust insulin based solely on information provided by this app.
            </p>

            <div className="space-y-2">
              <Label htmlFor="insulin-sensitivity" className="text-sm font-semibold text-white/90">
                Insulin sensitivity
              </Label>
              <p className="text-xs text-white/40">
                How much 1 unit of insulin typically lowers your glucose.
              </p>
              <div className="flex items-center gap-3">
                <NumberPadField
                  label="ISF"
                  value={insulinSensitivity}
                  onChange={handleInsulinSettingValueChange(
                    "insulin_sensitivity_mgdl_per_unit",
                    setInsulinSensitivity
                  )}
                  decimal={false}
                  maxLength={3}
                  className="w-24"
                />
                <span className="text-xs text-white/40">mg/dL per unit</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="correction-target" className="text-sm font-semibold text-white/90">
                Correction target
              </Label>
              <p className="text-xs text-white/40">
                Glucose baseline used when estimating correction insulin.
              </p>
              <div className="flex items-center gap-3">
                <NumberPadField
                  label="Target"
                  value={correctionTargetGlucose}
                  onChange={handleInsulinSettingValueChange(
                    "correction_target_glucose",
                    setCorrectionTargetGlucose
                  )}
                  decimal={false}
                  maxLength={3}
                  className="w-24"
                />
                <span className="text-xs text-white/40">mg/dL</span>
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
                <NumberPadField
                  label="Units"
                  value={unitsPer5g}
                  onChange={handleInsulinSettingValueChange(
                    "meal_insulin_units_per_5g",
                    setUnitsPer5g
                  )}
                  maxLength={5}
                  className="w-24"
                />
                <span className="text-xs text-white/40">units per 5 g</span>
              </div>
            </div>

            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <Label className="text-sm font-semibold text-white/90">
                  Meal/correction insulin types
                </Label>
                <SettingHelpButton id="types" openHelp={openHelp} setOpenHelp={setOpenHelp} />
              </div>
              <p className="text-xs text-white/40">
                These are the only insulin types used by the meal balance card.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(INSULIN_PROFILES).map(([name, profile]) => {
                  const selected = mealInsulinTypes.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleMealInsulinType(name)}
                      className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-left transition ${
                        selected
                          ? "border-teal-500/40 bg-teal-500/10 text-white"
                          : "border-white/10 bg-white/[0.03] text-white/45"
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-semibold">{name}</span>
                        <span className="text-[10px] uppercase tracking-wider opacity-50">{profile.category}</span>
                      </span>
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: selected ? "#2dd4bf" : "rgba(255,255,255,0.12)" }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
              <div className="space-y-2">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <Label htmlFor="meal-outcome-window" className="text-sm font-semibold text-white/90">
                    Meal review
                  </Label>
                  <SettingHelpButton id="review" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <div className="flex items-center gap-2">
                  <NumberPadField
                    label="Minutes"
                    value={outcomeWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_outcome_window_minutes",
                      setOutcomeWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-20"
                  />
                  <span className="text-xs text-white/40">min</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <Label htmlFor="pre-meal-window" className="text-sm font-semibold text-white/90">
                    Pre-meal insulin
                  </Label>
                  <SettingHelpButton id="pre" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <div className="flex items-center gap-2">
                  <NumberPadField
                    label="Minutes"
                    value={preMealWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_prebolus_window_minutes",
                      setPreMealWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-20"
                  />
                  <span className="text-xs text-white/40">min</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <Label htmlFor="post-meal-window" className="text-sm font-semibold text-white/90">
                    Post-meal insulin
                  </Label>
                  <SettingHelpButton id="post" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <div className="flex items-center gap-2">
                  <NumberPadField
                    label="Minutes"
                    value={postMealWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_postbolus_window_minutes",
                      setPostMealWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-20"
                  />
                  <span className="text-xs text-white/40">min</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Settings to Account */}
        <div className="space-y-2">
          <button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
              boxShadow: "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)",
            }}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <Check className="w-4 h-4" /> : null}
            {isSaving ? "Saving..." : saveSuccess ? "Saved!" : "Save to My Account"}
          </button>
          {saveError && (
            <p className="text-xs text-center text-red-400/80 px-4">{saveError}</p>
          )}
          <p className="text-[10px] text-center text-white/30 px-4">
            Your settings are saved securely to your account and follow you across devices.
          </p>
        </div>
      </div>
    </>
  );
}