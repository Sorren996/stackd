import { useEffect, useMemo, useState } from "react";
import { useCreateDoses } from "@/hooks/useLogMutations";
import { INSULIN_PROFILES, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  TapStepper,
  InsulinChips,
  CompactSegmented,
  NowTimeField,
  CollapsibleNote,
  FieldLabel,
  COPPER,
  CREAM,
  FAINT,
} from "@/components/forms/FieldKit";

function readInsulinLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem("insulin_library") || "null");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // fall through to defaults
  }
  return getDefaultInsulinLibrary();
}

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Log Insulin — reference shell. Only insulins from the user's settings appear.
 * A basal (e.g. Tresiba) hides the "covers" row; a fast insulin shows
 * "A meal | Correction" defaulting to A meal. Dose is a tap-to-type stepper
 * in 1u steps plus fixed pills 5/10/15/20. Time defaults to now. Optional
 * collapsed note. No dose recommendations anywhere in the flow.
 */
export default function LogInsulinForm({ open, onClose }) {
  const [insulinType, setInsulinType] = useState("");
  const [covers, setCovers] = useState("meal");
  const [units, setUnits] = useState("");
  const [date, setDate] = useState(getTodayDateValue);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [insulinLibrary, setInsulinLibrary] = useState(readInsulinLibrary);
  const [logging, setLogging] = useState(false);

  const createDoses = useCreateDoses();

  useEffect(() => {
    if (!open) return;
    setInsulinType("");
    setCovers("meal");
    setUnits("");
    setNotes("");
    setDate(getTodayDateValue());
    setTime(new Date().toTimeString().slice(0, 5));
  }, [open]);

  useEffect(() => {
    const refresh = () => setInsulinLibrary(readInsulinLibrary());
    window.addEventListener("insulin-settings-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("insulin-settings-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const typeOptions = useMemo(
    () =>
      Object.entries(INSULIN_PROFILES)
        .filter(([name]) => insulinLibrary.includes(name))
        .map(([name]) => ({ value: name, label: name })),
    [insulinLibrary]
  );

  const isBasal = insulinType ? isBasalInsulinType(insulinType) : false;

  const totalUnits = Number(units) || 0;
  const canSubmit = insulinType && totalUnits > 0 && !logging;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const [hours, minutes] = String(time || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      toast.error("Choose a time.");
      return;
    }
    const dt = date ? new Date(`${date}T00:00:00`) : new Date();
    dt.setHours(hours, minutes, 0, 0);
    if (dt.getTime() > Date.now()) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    navigator.vibrate?.(20);
    setLogging(true);

    const submittedDoses = [
      {
        insulin_type: insulinType,
        units: totalUnits,
        administered_at: dt.toISOString(),
        notes: notes || undefined,
      },
    ];
    const optimisticDoses = submittedDoses.map((dose, i) => ({
      ...dose,
      id: `optimistic-dose-${Date.now()}-${i}`,
      created_date: new Date().toISOString(),
    }));

    createDoses.mutate(
      { submittedDoses, optimisticDoses },
      {
        onSuccess: () => {
          setLogging(false);
          onClose?.();
        },
        onError: () => {
          setLogging(false);
          toast.error("Unable to log. Please try again.");
        },
      }
    );
  };

  return (
    <LogSheetShell
      open={open}
      onClose={onClose}
      title="Log insulin"
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
          style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
        >
          {logging
            ? "Logging..."
            : totalUnits
              ? `Log ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(1)} units`
              : "Add insulin units"}
        </button>
      }
    >
      <div className="space-y-6">
        <InsulinChips
          value={insulinType}
          onChange={setInsulinType}
          options={typeOptions}
          ariaLabel="Insulin type"
        />

        {!isBasal && insulinType && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: FAINT }}>
              This dose covers
            </span>
            <CompactSegmented
              value={covers}
              onChange={setCovers}
              options={[
                { value: "meal", label: "A meal" },
                { value: "correction", label: "Correction" },
              ]}
              ariaLabel="Covers"
            />
          </div>
        )}

        <TapStepper
          label="Dose"
          sub="· steps of 1u · tap to type"
          value={units}
          onChange={setUnits}
          unit="u"
          step={1}
          presets={[5, 10, 15, 20]}
        />

        <NowTimeField
          dateValue={date}
          timeValue={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          maxDate={getTodayDateValue()}
          maxTime={date === getTodayDateValue() ? new Date().toTimeString().slice(0, 5) : undefined}
        />

        <CollapsibleNote value={notes} onChange={setNotes} placeholder="e.g. before lunch" />
      </div>
    </LogSheetShell>
  );
}