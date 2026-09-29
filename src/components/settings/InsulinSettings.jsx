import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Info, Target, Leaf, Bell, Syringe, ShieldAlert } from "lucide-react";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { AnimatePresence, motion } from "framer-motion";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import InsulinTypeSelector from "@/components/settings/InsulinTypeSelector";
import StepperField from "@/components/settings/insulin/StepperField";
import AdvancedSection from "@/components/settings/insulin/AdvancedSection";
import { toast } from "sonner";
import { isMmolMode, formatGlucose, glucoseUnitLabel, onGlucoseUnitsChange } from "@/lib/glucoseUnits";

const INSULIN_PLAN_HELP = {
  review: {
    title: "Meal review",
    body: "How long the app keeps reviewing a grouped meal after you log it. It uses this window to group post-meal glucose readings with the meal.",
  },
  pre: {
    title: "Pre-meal insulin",
    body: "How far before the first carb log an insulin dose can still be paired with that meal. If you usually pre-bolus 10-20 minutes before eating, set this at least that long.",
  },
  post: {
    title: "Post-meal insulin",
    body: "How far after the last carb log an insulin dose can still be paired with that meal. This helps catch doses logged after eating or split meal boluses.",
  },
  types: {
    title: "Meal & correction types",
    body: "Select the insulin types you use for meals or corrections. Basal insulins such as Lantus or Tresiba should usually stay off so they don't count toward meal coverage.",
  },
  library: {
    title: "My insulin library",
    body: "Choose every insulin type you personally use. Only these appear when you log a dose, so add your basal insulins here even if they aren't used for meal coverage.",
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
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition"
      style={openHelp === id
        ? { borderColor: "rgba(91,101,80,0.45)", background: "rgba(91,101,80,0.12)", color: "#4d5742" }
        : { borderColor: "#eadccf", background: "#fdf9f2", color: "#5a5048" }
      }
      aria-label={`${help.title} help`}
    >
      <Info className="h-3.5 w-3.5" />
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
                style={{ color: "#5a5048", background: "#f7f1e8", border: "1px solid #eadccf" }}
                aria-label="Close help"
              >
                x
              </button>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#4a423a" }}>{help.body}</p>
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "#6b6153" }}>
              For app estimates only — not dosing advice.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// Group label — small muted caps, passes AA on the teal canvas (4.8:1+).
function GroupLabel({ icon: Icon, children }) {
  return (
    <div className="px-1 pt-1">
      <span className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "#8f8577" }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#eef2e9" }}>{children}</span>
      </span>
    </div>
  );
}

function RowDivider() {
  return <div className="my-0 h-px" style={{ background: "#eadccf" }} />;
}

// Convert a stored mg/dL string to the user's display unit string.
function toDisplayGlucose(mgdlStr) {
  if (!mgdlStr || mgdlStr === "") return "";
  const n = Number(mgdlStr);
  if (!Number.isFinite(n)) return "";
  if (!isMmolMode()) return mgdlStr;
  return (Math.round((n / 18) * 10) / 10).toString();
}

// Convert a display-unit string entered by the user back to mg/dL for storage.
function fromDisplayGlucose(displayStr) {
  if (!displayStr || displayStr === "") return "";
  if (!isMmolMode()) return displayStr;
  const n = Number(displayStr);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 18));
}

export default function InsulinSettings() {
  const { settings: serverSettings, save: saveSettings } = useUserSettings();
  const [openHelp, setOpenHelp] = useState(null);
  const [, setUnitsTick] = useState(0);
  useEffect(() => onGlucoseUnitsChange(() => setUnitsTick((t) => t + 1)), []);

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

  // Load settings from server when available — server is authoritative.
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

  // Persist any changes the moment the user leaves this page.
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
    window.dispatchEvent(new Event("insulin-settings-updated"));
  };

  const handleSetRecommended = () => {
    dirtyRef.current = true;
    setTargetLow(70);
    setTargetHigh(180);
    localStorage.setItem("target_range_low", "70");
    localStorage.setItem("target_range_high", "180");
    dispatchTargetRangeUpdated();
    toast.success(`Set to recommended range (${formatGlucose(70)} to ${formatGlucose(180)} ${glucoseUnitLabel()})`);
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

      <div className="space-y-7">
        {/* ── YOUR PLAN ─────────────────────────────────────── */}
        <div className="space-y-3">
          <GroupLabel icon={Syringe}>Your plan</GroupLabel>

          <div className="rounded-2xl p-5" style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}>
            <div className="space-y-5">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                    Insulin for every 5 g of carbs
                  </Label>
                  <SettingHelpButton id="types" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#5a5048" }}>
                  How much insulin covers a small portion of carbs.
                </p>
                <StepperField
                  label="Carb ratio"
                  value={unitsPer5g}
                  unit="u / 5g"
                  step={0.5}
                  decimal
                  onChange={handleInsulinSettingValueChange("meal_insulin_units_per_5g", setUnitsPer5g)}
                />
              </div>

              <RowDivider />

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                    How much one unit lowers glucose
                  </Label>
                  <SettingHelpButton id="types" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#5a5048" }}>
                  A higher number means each unit works harder for you.
                </p>
                <StepperField
                  label="Insulin sensitivity"
                  value={toDisplayGlucose(insulinSensitivity)}
                  unit={`${glucoseUnitLabel()} / u`}
                  step={isMmolMode() ? 0.1 : 5}
                  decimal={isMmolMode()}
                  onChange={(v) =>
                    handleInsulinSettingValueChange(
                      "insulin_sensitivity_mgdl_per_unit",
                      setInsulinSensitivity
                    )(fromDisplayGlucose(v))
                  }
                />
              </div>

              <RowDivider />

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                    Glucose target for corrections
                  </Label>
                  <SettingHelpButton id="types" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#5a5048" }}>
                  The baseline used when estimating a correction.
                </p>
                <StepperField
                  label="Correction target"
                  value={toDisplayGlucose(correctionTargetGlucose)}
                  unit={glucoseUnitLabel()}
                  step={isMmolMode() ? 0.1 : 5}
                  decimal={isMmolMode()}
                  onChange={(v) =>
                    handleInsulinSettingValueChange(
                      "correction_target_glucose",
                      setCorrectionTargetGlucose
                    )(fromDisplayGlucose(v))
                  }
                />
              </div>

              <RowDivider />

              {/* Target range — with quick recommended + slider */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                    Target range
                  </Label>
                  <button
                    type="button"
                    onClick={handleSetRecommended}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold transition active:opacity-70"
                    style={{ background: isRecommended ? "rgba(91,101,80,0.14)" : "#f7f1e8", border: "1px solid #eadccf", color: "#3f3830" }}
                  >
                    Recommended: {formatGlucose(70)}–{formatGlucose(180)} {glucoseUnitLabel()}
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{ color: isRecommended ? "#5a5048" : "#5b6550" }}
                  >
                    {formatGlucose(targetLow)}
                  </span>
                  <span className="text-lg font-bold tabular-nums" style={{ color: "#5b6550" }}>
                    {formatGlucose(targetHigh)}
                  </span>
                </div>
                <Slider
                  min={70}
                  max={250}
                  step={5}
                  value={[targetLow, targetHigh]}
                  onValueChange={handleSliderChange}
                  className="cursor-pointer"
                />
                <div className="flex justify-between text-xs" style={{ color: "#5a5048" }}>
                  <span>{formatGlucose(70)}</span>
                  <span>{formatGlucose(250)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── INSULIN ───────────────────────────────────────── */}
        <div className="space-y-3">
          <GroupLabel icon={Leaf}>Insulin</GroupLabel>

          <div className="rounded-2xl p-5" style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}>
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                    My insulin library
                  </Label>
                  <SettingHelpButton id="library" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <p className="text-xs" style={{ color: "#5a5048" }}>
                  The insulin types you use. Only these appear when you log a dose.
                </p>
                <InsulinTypeSelector selectedTypes={insulinLibrary} onToggle={toggleInsulinLibrary} />
              </div>

              <RowDivider />

              <div className="space-y-2">
                <div className="flex min-h-6 items-center justify-between gap-2">
                  <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                    Meal &amp; correction types
                  </Label>
                  <SettingHelpButton id="types" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <p className="text-xs" style={{ color: "#5a5048" }}>
                  The subset used for meal coverage and corrections.
                </p>
                <InsulinTypeSelector
                  selectedTypes={mealInsulinTypes}
                  onToggle={toggleMealInsulinType}
                  categories={["Rapid-Acting", "Intermediate-Acting"]}
                />
              </div>
            </div>
          </div>

          {/* Medical disclaimer — plain muted text, not a UI card */}
          <div className="flex items-start gap-2.5 px-1 pt-1">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#8f8577" }} />
            <p className="text-xs leading-relaxed" style={{ color: "#eef2e9", opacity: 0.94 }}>
              Enter only insulin settings prescribed or confirmed by your licensed healthcare
              professional. Stackd doesn't provide medical advice, verify dosing, or replace clinical
              judgment. Incorrect values may lead to serious low or high glucose. Don't start, stop, or
              adjust insulin based only on what this app shows.
            </p>
          </div>
        </div>

        {/* ── ALERTS & TIMING (Advanced) ────────────────────── */}
        <div className="space-y-3">
          <GroupLabel icon={Bell}>Alerts &amp; timing</GroupLabel>

          <AdvancedSection>
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold flex items-center gap-2" style={{ color: "#3f3830" }}>
                    <Target className="w-4 h-4" style={{ color: "#5b6550" }} />
                    Insulin stacking warnings
                  </Label>
                  <p className="text-xs" style={{ color: "#5a5048" }}>Alert when multiple rapid doses overlap</p>
                </div>
                <Switch checked={stackingAlerts} onCheckedChange={handleStackingToggle} />
              </div>

              <RowDivider />

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                    Meal review window
                  </Label>
                  <SettingHelpButton id="review" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                </div>
                <p className="text-xs" style={{ color: "#5a5048" }}>How long a meal is reviewed after you log it.</p>
                <StepperField
                  label="Meal review minutes"
                  value={outcomeWindowMinutes}
                  unit="min"
                  step={15}
                  decimal={false}
                  onChange={handleInsulinSettingValueChange("meal_outcome_window_minutes", setOutcomeWindowMinutes)}
                />
              </div>

              <RowDivider />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                      Pre-meal
                    </Label>
                    <SettingHelpButton id="pre" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                  </div>
                  <p className="text-xs" style={{ color: "#5a5048" }}>How far before eating a dose still pairs with the meal.</p>
                  <StepperField
                    label="Pre-meal window minutes"
                    value={preMealWindowMinutes}
                    unit="min"
                    step={5}
                    decimal={false}
                    onChange={handleInsulinSettingValueChange("meal_prebolus_window_minutes", setPreMealWindowMinutes)}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                      Post-meal
                    </Label>
                    <SettingHelpButton id="post" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                  </div>
                  <p className="text-xs" style={{ color: "#5a5048" }}>How far after eating a dose still pairs with the meal.</p>
                  <StepperField
                    label="Post-meal window minutes"
                    value={postMealWindowMinutes}
                    unit="min"
                    step={5}
                    decimal={false}
                    onChange={handleInsulinSettingValueChange("meal_postbolus_window_minutes", setPostMealWindowMinutes)}
                  />
                </div>
              </div>
            </div>
          </AdvancedSection>
        </div>
      </div>
    </>
  );
}