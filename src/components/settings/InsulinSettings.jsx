import { useState, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import { isMmolMode, formatGlucose, glucoseUnitLabel, onGlucoseUnitsChange } from "@/lib/glucoseUnits";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import Sheet from "@/components/Sheet";
import SettingRow from "@/components/settings/insulin/SettingRow";
import NumericEditSheet from "@/components/settings/insulin/NumericEditSheet";
import TargetRangeSheet from "@/components/settings/insulin/TargetRangeSheet";
import StackingSheet from "@/components/settings/insulin/StackingSheet";
import LibraryPicker from "@/components/settings/insulin/LibraryPicker";
import SubsetPicker from "@/components/settings/insulin/SubsetPicker";
import { toast } from "sonner";

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

// Section header — plain small gray uppercase text sitting directly on teal.
function GroupLabel({ children }) {
  return (
    <div className="px-1 pt-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#eef2e9" }}>
        {children}
      </span>
    </div>
  );
}

// Cream grouped card — no border, drop shadow, hairline row dividers.
function GroupCard({ children }) {
  return (
    <div
      className="overflow-hidden rounded-[20px]"
      style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}
    >
      {children}
    </div>
  );
}

function RowDivider() {
  return <div className="mx-4 h-px" style={{ background: "#eadccf" }} />;
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

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const handleValue = (key, setValue) => (value) => {
    setValue(value);
    markDirty();
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
    markDirty();
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
    markDirty();
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

  const handleStacking = (checked) => {
    markDirty();
    setStackingAlerts(checked);
    localStorage.setItem("stacking_alerts_enabled", checked ? "true" : "false");
    window.dispatchEvent(new Event("insulin-settings-updated"));
  };

  const handleTargetRange = (low, high) => {
    markDirty();
    setTargetLow(low);
    setTargetHigh(high);
    localStorage.setItem("target_range_low", low.toString());
    localStorage.setItem("target_range_high", high.toString());
    dispatchTargetRangeUpdated();
    toast.success(`Set target range to ${formatGlucose(low)}–${formatGlucose(high)} ${glucoseUnitLabel()}`);
  };

  // ── Active edit sheet state ──
  const [activeSheet, setActiveSheet] = useState(null); // 'sensitivity'|'carb'|'correction'|'range'|'stacking'|'review'|'pre'|'post'
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [subsetOpen, setSubsetOpen] = useState(false);

  const closeSheet = () => setActiveSheet(null);

  const sensitivityStep = () => (isMmolMode() ? 0.1 : 5);
  const sensitivityDecimal = () => isMmolMode();

  // Stepper helpers — return the next display-value string from a draft.
  const stepDraft = (step, decimal) => (draft) => {
    const n = draft === "" ? 0 : Number(draft);
    if (!Number.isFinite(n)) return draft;
    const next = decimal ? Math.round((n + step) * 100) / 100 : Math.round(n + step);
    return String(Math.max(0, next));
  };

  return (
    <>
      {/* Edit sheets */}
      <Sheet open={activeSheet === "sensitivity"} onClose={closeSheet}>
        <NumericEditSheet
          title="Insulin sensitivity"
          value={toDisplayGlucose(insulinSensitivity)}
          unit={`${glucoseUnitLabel()} per unit`}
          help="How much one unit lowers your glucose."
          decrement={stepDraft(-sensitivityStep(), sensitivityDecimal())}
          increment={stepDraft(sensitivityStep(), sensitivityDecimal())}
          onSave={(v) => {
            handleValue("insulin_sensitivity_mgdl_per_unit", setInsulinSensitivity)(fromDisplayGlucose(v));
            closeSheet();
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet open={activeSheet === "carb"} onClose={closeSheet}>
        <NumericEditSheet
          title="Carb ratio"
          value={unitsPer5g}
          unit="units per 5g"
          help="How much insulin covers a small portion of carbs."
          decrement={stepDraft(-0.5, true)}
          increment={stepDraft(0.5, true)}
          onSave={(v) => {
            handleValue("meal_insulin_units_per_5g", setUnitsPer5g)(v);
            closeSheet();
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet open={activeSheet === "correction"} onClose={closeSheet}>
        <NumericEditSheet
          title="Correction target"
          value={toDisplayGlucose(correctionTargetGlucose)}
          unit={glucoseUnitLabel()}
          help="The baseline used when estimating a correction."
          decrement={stepDraft(-sensitivityStep(), sensitivityDecimal())}
          increment={stepDraft(sensitivityStep(), sensitivityDecimal())}
          onSave={(v) => {
            handleValue("correction_target_glucose", setCorrectionTargetGlucose)(fromDisplayGlucose(v));
            closeSheet();
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet open={activeSheet === "range"} onClose={closeSheet}>
        <TargetRangeSheet
          low={targetLow}
          high={targetHigh}
          onSave={(low, high) => {
            handleTargetRange(low, high);
            closeSheet();
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet open={activeSheet === "stacking"} onClose={closeSheet}>
        <StackingSheet
          value={stackingAlerts}
          onSave={(checked) => {
            handleStacking(checked);
            closeSheet();
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet open={activeSheet === "review"} onClose={closeSheet}>
        <NumericEditSheet
          title="Meal review window"
          value={outcomeWindowMinutes}
          unit="minutes"
          help="How long a meal is reviewed after you log it."
          decrement={stepDraft(-15, false)}
          increment={stepDraft(15, false)}
          onSave={(v) => {
            handleValue("meal_outcome_window_minutes", setOutcomeWindowMinutes)(v);
            closeSheet();
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet open={activeSheet === "pre"} onClose={closeSheet}>
        <NumericEditSheet
          title="Pre-meal window"
          value={preMealWindowMinutes}
          unit="minutes"
          help="How far before eating a dose still pairs with the meal."
          decrement={stepDraft(-5, false)}
          increment={stepDraft(5, false)}
          onSave={(v) => {
            handleValue("meal_prebolus_window_minutes", setPreMealWindowMinutes)(v);
            closeSheet();
          }}
          onCancel={closeSheet}
        />
      </Sheet>

      <Sheet open={activeSheet === "post"} onClose={closeSheet}>
        <NumericEditSheet
          title="Post-meal window"
          value={postMealWindowMinutes}
          unit="minutes"
          help="How far after eating a dose still pairs with the meal."
          decrement={stepDraft(setPostMealWindowMinutes, -5, false)}
          increment={stepDraft(setPostMealWindowMinutes, 5, false)}
          onSave={(v) => handleValue("meal_postbolus_window_minutes", setPostMealWindowMinutes)(v) && closeSheet()}
          onCancel={closeSheet}
        />
      </Sheet>

      {/* Full-screen pickers */}
      {libraryOpen && (
        <LibraryPicker
          selected={insulinLibrary}
          onToggle={toggleInsulinLibrary}
          onClose={() => setLibraryOpen(false)}
        />
      )}
      {subsetOpen && (
        <SubsetPicker
          library={insulinLibrary}
          selected={mealInsulinTypes}
          onToggle={toggleMealInsulinType}
          onClose={() => setSubsetOpen(false)}
        />
      )}

      <div className="space-y-7">
        {/* ── YOUR PLAN ─────────────────────────────────── */}
        <div className="space-y-2.5">
          <GroupLabel>Your plan</GroupLabel>
          <GroupCard>
            <SettingRow
              label="Insulin sensitivity"
              value={`${toDisplayGlucose(insulinSensitivity) || "—"} ${glucoseUnitLabel()} per U`}
              onPress={() => setActiveSheet("sensitivity")}
            />
            <RowDivider />
            <SettingRow
              label="Carb ratio"
              value={`${unitsPer5g || "—"} U per 5g`}
              onPress={() => setActiveSheet("carb")}
            />
            <RowDivider />
            <SettingRow
              label="Correction target"
              value={`${toDisplayGlucose(correctionTargetGlucose) || "—"} ${glucoseUnitLabel()}`}
              onPress={() => setActiveSheet("correction")}
            />
          </GroupCard>
        </div>

        {/* ── INSULIN LIBRARY ───────────────────────────── */}
        <div className="space-y-2.5">
          <GroupLabel>Insulin library</GroupLabel>
          <GroupCard>
            <SettingRow
              label="My insulin library"
              value={`${insulinLibrary.length} selected`}
              onPress={() => setLibraryOpen(true)}
            />
            <RowDivider />
            <SettingRow
              label="Meal & correction types"
              value={`${mealInsulinTypes.length} of ${insulinLibrary.length}`}
              onPress={() => setSubsetOpen(true)}
            />
          </GroupCard>
        </div>

        {/* ── ADVANCED ──────────────────────────────────── */}
        <div className="space-y-2.5">
          <GroupLabel>Advanced</GroupLabel>
          <GroupCard>
            <SettingRow
              label="Target range"
              value={`${formatGlucose(targetLow)}–${formatGlucose(targetHigh)} ${glucoseUnitLabel()}`}
              onPress={() => setActiveSheet("range")}
            />
            <RowDivider />
            <SettingRow
              label="Stacking warnings"
              value={stackingAlerts ? "On" : "Off"}
              onPress={() => setActiveSheet("stacking")}
            />
            <RowDivider />
            <SettingRow
              label="Meal review window"
              value={`${outcomeWindowMinutes} min`}
              onPress={() => setActiveSheet("review")}
            />
            <RowDivider />
            <SettingRow
              label="Pre-meal window"
              value={`${preMealWindowMinutes} min`}
              onPress={() => setActiveSheet("pre")}
            />
            <RowDivider />
            <SettingRow
              label="Post-meal window"
              value={`${postMealWindowMinutes} min`}
              onPress={() => setActiveSheet("post")}
            />
          </GroupCard>
        </div>

        {/* ── Disclaimer — plain footnote, AA on teal ────── */}
        <p className="px-1 pt-1 text-xs leading-relaxed" style={{ color: "#eef2e9" }}>
          Enter only insulin settings prescribed or confirmed by your licensed healthcare
          professional. Stackd doesn't provide medical advice or verify dosing. Don't start, stop,
          or adjust insulin based only on what this app shows.
        </p>
      </div>
    </>
  );
}