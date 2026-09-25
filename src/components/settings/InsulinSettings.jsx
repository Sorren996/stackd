import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Target, Info, Leaf, Bell, Syringe } from "lucide-react";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { AnimatePresence, motion } from "framer-motion";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import InsulinTypeSelector from "@/components/settings/InsulinTypeSelector";
import SectionCard from "@/components/editorial/SectionCard";
import NumberPadField from "@/components/settings/insulin/NumberPadField";
import DoseMathTile from "@/components/settings/insulin/DoseMathTile";
import AdvancedSection from "@/components/settings/insulin/AdvancedSection";
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
  library: {
    title: "My insulin library",
    body: "Choose every insulin type you personally use. Only these appear when logging a dose, so add your basal insulins here even if they aren't used for meal coverage.",
  },
};

const CANOPY_GLASS = {
  background: "#fdf9f2",
  border: "1px solid #eadccf",
  boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)",
};

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ background: "rgba(91,101,80,0.12)", border: "1px solid rgba(91,101,80,0.28)" }}
      >
        <Icon className="h-3 w-3" style={{ color: "#5b6550" }} />
      </span>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>{children}</h3>
    </div>
  );
}

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

function readInsulinLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem("insulin_library") || "null");
    return Array.isArray(parsed) && parsed.length ? parsed : getDefaultInsulinLibrary();
  } catch {
    return getDefaultInsulinLibrary();
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
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition"
      style={openHelp === id
        ? { borderColor: "rgba(91,101,80,0.45)", background: "rgba(91,101,80,0.12)", color: "#4d5742" }
        : { borderColor: "#eadccf", background: "#fdf9f2", color: "#6b6153" }
      }
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
          className="fixed inset-0 z-[999]"
          style={{ background: "rgba(63, 56, 48, 0.25)" }}
          onClick={onClose}
        >
          <motion.div
            key={openHelp}
            initial={{ opacity: 0, y: 34, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 460, damping: 32, mass: 0.85 }}
            className="fixed bottom-24 left-4 right-4 mx-auto w-auto max-w-sm rounded-2xl border p-4 text-left shadow-2xl sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-24 sm:w-full sm:-translate-x-1/2"
            style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 8px 28px rgba(63, 56, 48, 0.12)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>{help.title}</p>
              <button
                type="button"
                onClick={onClose}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ color: "#746959", background: "#f7f1e8", border: "1px solid #eadccf" }}
                aria-label="Close help"
              >
                x
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>{help.body}</p>
            <p className="mt-2 text-[10px] leading-relaxed" style={{ color: "#746959" }}>
              This is for app estimates only and is not dosing advice.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default function InsulinSettings() {
  const { settings: serverSettings, save: saveSettings } = useUserSettings();
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
  const [insulinLibrary, setInsulinLibrary] = useState(readInsulinLibrary);

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
    if (Array.isArray(serverSettings.insulin_library) && serverSettings.insulin_library.length) {
      setInsulinLibrary(serverSettings.insulin_library);
      localStorage.setItem("insulin_library", JSON.stringify(serverSettings.insulin_library));
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

  const dirtyRef = useRef(false);
  const valuesRef = useRef(null);
  const saveRef = useRef(saveSettings);
  saveRef.current = saveSettings;

  const buildPayload = () => ({
    insulin_sensitivity_mgdl_per_unit: insulinSensitivity === "" ? undefined : Number(insulinSensitivity),
    correction_target_glucose: correctionTargetGlucose === "" ? undefined : Number(correctionTargetGlucose),
    meal_insulin_units_per_5g: unitsPer5g === "" ? undefined : Number(unitsPer5g),
    meal_insulin_types: mealInsulinTypes,
    insulin_library: insulinLibrary,
    meal_prebolus_window_minutes: preMealWindowMinutes === "" ? undefined : Number(preMealWindowMinutes),
    meal_postbolus_window_minutes: postMealWindowMinutes === "" ? undefined : Number(postMealWindowMinutes),
    meal_outcome_window_minutes: outcomeWindowMinutes === "" ? undefined : Number(outcomeWindowMinutes),
    target_range_low: targetLow,
    target_range_high: targetHigh,
    stacking_alerts_enabled: stackingAlerts,
  });

  valuesRef.current = buildPayload();

  // Persist any changes to the user's account the moment they leave this page.
  useEffect(() => {
    return () => {
      if (dirtyRef.current && valuesRef.current) {
        saveRef.current(valuesRef.current);
      }
    };
  }, []);

  const handleInsulinSettingValueChange = (key, setValue) => (value) => {
    setValue(value);
    dirtyRef.current = true;

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
    dirtyRef.current = true;
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

  const toggleInsulinLibrary = (name) => {
    dirtyRef.current = true;
    setInsulinLibrary((current) => {
      const next = current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name];
      const saved = next.length ? next : getDefaultInsulinLibrary();

      localStorage.setItem("insulin_library", JSON.stringify(saved));
      window.dispatchEvent(new Event("insulin-settings-updated"));
      return saved;
    });
  };

  const isRecommended = targetLow === 70 && targetHigh === 180;

  const handleStackingToggle = (checked) => {
    setStackingAlerts(checked);
    dirtyRef.current = true;
    localStorage.setItem("stacking_alerts_enabled", checked ? "true" : "false");
  };

  const handleSetRecommended = () => {
    dirtyRef.current = true;
    setTargetLow(70);
    setTargetHigh(180);
    localStorage.setItem("target_range_low", "70");
    localStorage.setItem("target_range_high", "180");
    dispatchTargetRangeUpdated();
    toast.success("Set to recommended range (70 to 180 mg/dL)");
  };

  const handleSliderChange = ([low, high]) => {
    dirtyRef.current = true;
    setTargetLow(low);
    setTargetHigh(high);
    localStorage.setItem("target_range_low", low.toString());
    localStorage.setItem("target_range_high", high.toString());
    dispatchTargetRangeUpdated();
  };

  return (
    <>
      <SettingsHelpOverlay openHelp={openHelp} onClose={() => setOpenHelp(null)} />

      <div className="space-y-5">
        {/* Medical disclaimer — sandstone card with copper accent */}
        <SectionCard>
          <div className="rounded-2xl px-4 py-3.5" style={{ background: "#f7f1e8", borderLeft: "3px solid #9c5228" }}>
            <p className="text-[11px] leading-relaxed" style={{ color: "#3f3830" }}>
              Enter only insulin settings prescribed or confirmed by your licensed healthcare professional. This app does not provide medical advice, verify dosing accuracy, or replace clinical judgment. Incorrect values may result in serious hypoglycemia or hyperglycemia. Do not start, stop, or adjust insulin based solely on information provided by this app.
            </p>
          </div>
        </SectionCard>

        {/* A. Your insulin — which insulins you use and their action profiles */}
        <SectionCard label="Your Insulin">
          <div className="space-y-5 pt-3 pb-2">
            <div className="space-y-2">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                  My insulin library
                </Label>
                <SettingHelpButton id="library" openHelp={openHelp} setOpenHelp={setOpenHelp} />
              </div>
              <p className="text-xs" style={{ color: "#746959" }}>
                Every insulin type you use. Only these appear when logging a dose.
              </p>
              <InsulinTypeSelector selectedTypes={insulinLibrary} onToggle={toggleInsulinLibrary} />
            </div>

            <div className="space-y-2 border-t pt-4" style={{ borderColor: "#eadccf" }}>
              <div className="flex min-h-6 items-center justify-between gap-2">
                <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                  Meal &amp; correction types
                </Label>
                <SettingHelpButton id="types" openHelp={openHelp} setOpenHelp={setOpenHelp} />
              </div>
              <p className="text-xs" style={{ color: "#746959" }}>
                The subset of your library used for meal coverage and corrections.
              </p>
              <InsulinTypeSelector
                selectedTypes={mealInsulinTypes}
                onToggle={toggleMealInsulinType}
                categories={["Rapid-Acting", "Intermediate-Acting"]}
              />
            </div>
          </div>
        </SectionCard>

        {/* B. Dose math — the numbers that drive calculations */}
        {insulinLibrary.length === 0 ? (
          <SectionCard label="Dose Math">
            <div className="pt-3 pb-2">
              <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>
                Add the insulins you use above, then set your sensitivity, carb ratio, and correction target here.
              </p>
            </div>
          </SectionCard>
        ) : (
          <SectionCard label="Dose Math">
            <div className="space-y-5 pt-3 pb-2">
              <DoseMathTile
                plainLabel="How much one unit lowers your glucose"
                technicalLabel="Insulin sensitivity"
                value={insulinSensitivity}
                unit="mg/dL / unit"
                helper="A higher number means each unit works harder for you."
                padTitle="Insulin sensitivity"
                onChange={handleInsulinSettingValueChange(
                  "insulin_sensitivity_mgdl_per_unit",
                  setInsulinSensitivity
                )}
              />

              <div className="border-t pt-5" style={{ borderColor: "#eadccf" }}>
                <DoseMathTile
                  plainLabel="Insulin for every 5 grams of carbs"
                  technicalLabel="Carb ratio (per 5g)"
                  value={unitsPer5g}
                  unit="units / 5g"
                  helper="Sets how much insulin covers a small portion of carbs."
                  padTitle="Carb ratio"
                  decimal={true}
                  maxLength={5}
                  onChange={handleInsulinSettingValueChange(
                    "meal_insulin_units_per_5g",
                    setUnitsPer5g
                  )}
                />
              </div>

              <div className="border-t pt-5" style={{ borderColor: "#eadccf" }}>
                <DoseMathTile
                  plainLabel="Glucose target for corrections"
                  technicalLabel="Correction target"
                  value={correctionTargetGlucose}
                  unit="mg/dL"
                  helper="The baseline used when estimating a correction dose."
                  padTitle="Correction target"
                  onChange={handleInsulinSettingValueChange(
                    "correction_target_glucose",
                    setCorrectionTargetGlucose
                  )}
                />
              </div>
            </div>
          </SectionCard>
        )}

        {/* C. Advanced — rarely-touched settings, collapsed by default */}
        <AdvancedSection>
          <SectionCard label="Target Range">
            <div className="flex gap-4 items-stretch pt-3 pb-2">
              <button
                onClick={handleSetRecommended}
                className="shrink-0 w-28 py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-center"
                style={isRecommended
                  ? { background: "rgba(91,101,80,0.12)", borderColor: "rgba(91,101,80,0.45)" }
                  : { background: "#f7f1e8", borderColor: "#eadccf" }
                }
              >
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#746959" }}>Recommended</div>
                <div className="text-base font-extrabold mt-1" style={{ color: "#3f3830" }}>70 to 180</div>
                <div className="text-[9px] mt-0.5" style={{ color: "#746959" }}>mg/dL</div>
              </button>

              <div className="flex-1 flex flex-col justify-center space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "#746959" }}>Custom Range</span>
                  <span className="text-sm font-bold" style={{ color: "#5b6550" }}>{targetLow} to {targetHigh} mg/dL</span>
                </div>
                <Slider
                  min={70}
                  max={250}
                  step={5}
                  value={[targetLow, targetHigh]}
                  onValueChange={handleSliderChange}
                  className="cursor-pointer" />
                <div className="flex justify-between text-[10px]" style={{ color: "#746959" }}>
                  <span>70</span>
                  <span>250</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard label="Alerts">
            <div className="flex items-center justify-between gap-4 pt-3 pb-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold flex items-center gap-2" style={{ color: "#3f3830" }}>
                  <Target className="w-4 h-4" style={{ color: "#5b6550" }} />
                  Insulin Stacking Warnings
                </Label>
                <p className="text-xs" style={{ color: "#746959" }}>Alert when multiple rapid doses overlap</p>
              </div>
              <Switch checked={stackingAlerts} onCheckedChange={handleStackingToggle} />
            </div>
          </SectionCard>

          <SectionCard label="Meal Timing">
            <div className="space-y-4 pt-3 pb-2">
              <div className="space-y-1.5">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <Label htmlFor="meal-outcome-window" className="text-xs font-semibold" style={{ color: "#3f3830" }}>
                    Meal review window
                  </Label>
                  <SettingHelpButton id="review" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <NumberPadField
                  label="Meal review (minutes)"
                  value={outcomeWindowMinutes}
                  onChange={handleInsulinSettingValueChange(
                    "meal_outcome_window_minutes",
                    setOutcomeWindowMinutes
                  )}
                  decimal={false}
                  maxLength={3}
                  className="w-full"
                  unit="min"
                />
                <p className="text-[10px] leading-tight" style={{ color: "#746959" }}>
                  How long after a meal the app keeps reviewing that grouped meal.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t pt-4" style={{ borderColor: "#eadccf" }}>
                <div className="space-y-1.5">
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <Label htmlFor="pre-meal-window" className="text-xs font-semibold" style={{ color: "#3f3830" }}>
                      Pre-meal
                    </Label>
                    <SettingHelpButton id="pre" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                  </div>
                  <NumberPadField
                    label="Pre-meal window (minutes)"
                    value={preMealWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_prebolus_window_minutes",
                      setPreMealWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-full"
                    unit="min"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <Label htmlFor="post-meal-window" className="text-xs font-semibold" style={{ color: "#3f3830" }}>
                      Post-meal
                    </Label>
                    <SettingHelpButton id="post" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                  </div>
                  <NumberPadField
                    label="Post-meal window (minutes)"
                    value={postMealWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_postbolus_window_minutes",
                      setPostMealWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-full"
                    unit="min"
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        </AdvancedSection>
      </div>
    </>
  );
}