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
  background: "linear-gradient(155deg, rgba(22,48,50,0.55), rgba(11,26,28,0.62))",
  border: "1px solid rgba(95,180,144,0.18)",
  boxShadow:
    "0 14px 40px rgba(0,0,0,0.28), inset 0 1px 1px rgba(161,209,185,0.08), inset 0 -1px 1px rgba(0,0,0,0.18)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ background: "rgba(95,180,144,0.12)", border: "1px solid rgba(95,180,144,0.28)" }}
      >
        <Icon className="h-3 w-3 text-[#a1d1b9]" />
      </span>
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{children}</h3>
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
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
        openHelp === id
          ? "border-[#5fb490]/45 bg-[#5fb490]/12 text-[#a1d1b9]"
          : "border-white/10 bg-white/5 text-white/35 hover:text-[#a1d1b9]"
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
    <div
      ref={fieldRef}
      className={`rounded-2xl px-3 py-2 ${className}`}
      style={{
        background: "linear-gradient(145deg, rgba(22,48,50,0.5), rgba(11,26,28,0.5))",
        border: "1px solid rgba(95,180,144,0.16)",
      }}
    >
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-10 w-full flex-col items-start justify-center gap-0.5 text-left">
        <span className={`max-w-full truncate text-base font-bold leading-tight ${textValue ? "text-[#a1d1b9]" : "text-white/25"}`}>{textValue || placeholder}</span>
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
    toast.success("Set to recommended range (70–180 mg/dL)");
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
        {/* Target Range Preference */}
        <section className="space-y-2.5">
          <SectionLabel icon={Target}>Target Range Preference</SectionLabel>
          <div className="rounded-3xl p-4 flex gap-4 items-stretch" style={CANOPY_GLASS}>
            <button
              onClick={handleSetRecommended}
              className={`shrink-0 w-28 py-3 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-center ${
                isRecommended
                  ? "bg-[#5fb490]/12 border-[#5fb490]/45 text-white"
                  : "bg-white/[0.01] border-white/10 text-white/40 hover:bg-white/[0.03]"
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider opacity-60">Recommended</div>
              <div className="text-base font-extrabold mt-1">70–180</div>
              <div className="text-[9px] text-white/30 mt-0.5">mg/dL</div>
            </button>

            <div className="flex-1 flex flex-col justify-center space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-white/40 uppercase tracking-wider">Custom Range</span>
                <span className="text-sm font-bold text-[#a1d1b9]">{targetLow}–{targetHigh} mg/dL</span>
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
        </section>

        {/* Alerts & Preferences */}
        <section className="space-y-2.5">
          <SectionLabel icon={Bell}>Alerts & Preferences</SectionLabel>
          <div className="rounded-3xl p-4" style={CANOPY_GLASS}>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold text-white/90 flex items-center gap-2">
                  <Target className="w-4 h-4 text-[#5fb490]" />
                  Insulin Stacking Warnings
                </Label>
                <p className="text-xs text-white/40">Alert when multiple rapid doses overlap</p>
              </div>
              <Switch checked={stackingAlerts} onCheckedChange={handleStackingToggle} />
            </div>
          </div>
        </section>

        {/* Insulin Plan */}
        <section className="space-y-2.5">
          <SectionLabel icon={Syringe}>Insulin Plan</SectionLabel>
          <div className="rounded-3xl p-4 space-y-5" style={CANOPY_GLASS}>
            <div className="rounded-2xl border-l-2 border-[#5fb490]/45 bg-[#5fb490]/[0.05] px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-white/45">
                Enter only insulin settings prescribed or confirmed by your licensed healthcare professional. This app does not provide medical advice, verify dosing accuracy, or replace clinical judgment. Incorrect values may result in serious hypoglycemia or hyperglycemia. Do not start, stop, or adjust insulin based solely on information provided by this app.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="insulin-sensitivity" className="text-xs font-semibold text-white/80">
                  Insulin sensitivity
                </Label>
                <NumberPadField
                  label="ISF"
                  value={insulinSensitivity}
                  onChange={handleInsulinSettingValueChange(
                    "insulin_sensitivity_mgdl_per_unit",
                    setInsulinSensitivity
                  )}
                  decimal={false}
                  maxLength={3}
                  className="w-full"
                />
                <p className="text-[10px] text-white/35">mg/dL per unit</p>
                <p className="text-[10px] leading-tight text-white/30">
                  How much 1 unit typically lowers your glucose.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="correction-target" className="text-xs font-semibold text-white/80">
                  Correction target
                </Label>
                <NumberPadField
                  label="Target"
                  value={correctionTargetGlucose}
                  onChange={handleInsulinSettingValueChange(
                    "correction_target_glucose",
                    setCorrectionTargetGlucose
                  )}
                  decimal={false}
                  maxLength={3}
                  className="w-full"
                />
                <p className="text-[10px] text-white/35">mg/dL</p>
                <p className="text-[10px] leading-tight text-white/30">
                  Glucose baseline used when estimating correction insulin.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meal-insulin" className="text-xs font-semibold text-white/80">
                Meal insulin
              </Label>
              <div className="flex items-center gap-3">
                <NumberPadField
                  label="Units"
                  value={unitsPer5g}
                  onChange={handleInsulinSettingValueChange(
                    "meal_insulin_units_per_5g",
                    setUnitsPer5g
                  )}
                  maxLength={5}
                  className="w-28"
                />
                <span className="text-[10px] text-white/35">units per 5 g</span>
              </div>
              <p className="text-[10px] leading-tight text-white/30">
                Insulin units used to cover 5 grams of carbohydrates.
              </p>
            </div>

            <div className="space-y-3 border-t border-[#5fb490]/12 pt-4">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <Label className="text-sm font-semibold text-white/90">
                  My insulin library
                </Label>
                <SettingHelpButton id="library" openHelp={openHelp} setOpenHelp={setOpenHelp} />
              </div>
              <p className="text-xs text-white/40">
                Every insulin type you use. Only these appear when logging a dose.
              </p>
              <InsulinTypeSelector selectedTypes={insulinLibrary} onToggle={toggleInsulinLibrary} />
            </div>

            <div className="space-y-3 border-t border-[#5fb490]/12 pt-4">
              <div className="flex min-h-6 items-center justify-between gap-2">
                <Label className="text-sm font-semibold text-white/90">
                  Meal/correction insulin types
                </Label>
                <SettingHelpButton id="types" openHelp={openHelp} setOpenHelp={setOpenHelp} />
              </div>
              <p className="text-xs text-white/40">
                The subset of your library used for meal coverage and corrections.
              </p>
              <InsulinTypeSelector
                selectedTypes={mealInsulinTypes}
                onToggle={toggleMealInsulinType}
                categories={["Rapid-Acting", "Intermediate-Acting"]}
              />
            </div>

            <div className="space-y-3 border-t border-[#5fb490]/12 pt-4">
              <Label className="text-sm font-semibold text-white/90">Timing</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <Label htmlFor="meal-outcome-window" className="text-xs font-semibold text-white/80">
                      Meal review
                    </Label>
                    <SettingHelpButton id="review" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                  </div>
                  <NumberPadField
                    label="Minutes"
                    value={outcomeWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_outcome_window_minutes",
                      setOutcomeWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-full"
                  />
                  <p className="text-[10px] text-white/35">min</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <Label htmlFor="pre-meal-window" className="text-xs font-semibold text-white/80">
                      Pre-meal insulin
                    </Label>
                    <SettingHelpButton id="pre" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                  </div>
                  <NumberPadField
                    label="Minutes"
                    value={preMealWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_prebolus_window_minutes",
                      setPreMealWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-full"
                  />
                  <p className="text-[10px] text-white/35">min</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex min-h-6 items-center justify-between gap-2">
                    <Label htmlFor="post-meal-window" className="text-xs font-semibold text-white/80">
                      Post-meal insulin
                    </Label>
                    <SettingHelpButton id="post" openHelp={openHelp} setOpenHelp={setOpenHelp} />
                  </div>
                  <NumberPadField
                    label="Minutes"
                    value={postMealWindowMinutes}
                    onChange={handleInsulinSettingValueChange(
                      "meal_postbolus_window_minutes",
                      setPostMealWindowMinutes
                    )}
                    decimal={false}
                    maxLength={3}
                    className="w-full"
                  />
                  <p className="text-[10px] text-white/35">min</p>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}