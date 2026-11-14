import { useEffect, useRef, useState } from "react";
import { useCreateGlucose } from "@/hooks/useLogMutations";
import { getGlucoseUnits, glucoseUnitLabel, parseGlucoseInput, formatGlucose, glucoseInputMax } from "@/lib/glucoseUnits";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  StepperField,
  TimeField,
  TextField,
  COPPER,
  CREAM,
} from "@/components/forms/FieldKit";

// The one preset set, stated in mg/dL and shown in whichever unit is active.
const PRESETS_MGDL = [70, 100, 130, 180];

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Log Glucose (Reading) form — shared shell. Glucose value stepper, time,
 * optional notes. Uses the user's configured glucose units (mg/dL or mmol/L).
 */
export default function LogGlucoseForm({ open, onClose }) {
  const [value, setValue] = useState("");
  // The last sensible value typed or stepped to, so a cleared field still has
  // something real to fall back on.
  const lastValid = useRef(null);
  const [date, setDate] = useState(getTodayDateValue);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [glucoseUnits, setGlucoseUnits] = useState(getGlucoseUnits);
  const [logging, setLogging] = useState(false);

  const createGlucose = useCreateGlucose();

  useEffect(() => {
    if (!open) return;
    setValue("");
    lastValid.current = null;
    setNotes("");
    setDate(getTodayDateValue());
    setTime(new Date().toTimeString().slice(0, 5));
  }, [open]);

  useEffect(() => {
    const refresh = () => setGlucoseUnits(getGlucoseUnits());
    window.addEventListener("glucose-units-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("glucose-units-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // One stepper serves both units: mmol/L steps by 0.1 and keeps one decimal,
  // mg/dL steps by 5. The same presets show in whichever unit is active.
  const isMmol = glucoseUnits === "mmol/L";
  const decimals = isMmol ? 1 : 0;
  const step = isMmol ? 0.1 : 5;
  const max = glucoseInputMax();
  const presets = isMmol
    ? PRESETS_MGDL.map((mg) => Number(formatGlucose(mg)))
    : PRESETS_MGDL;

  // What will actually be saved: the field's own value, capped at the ceiling,
  // or the last valid value when the field has been cleared. The Log label
  // reads this, so it always matches the reading that goes in.
  const typed = Number(value);
  const effective = Number.isFinite(typed) && typed > 0
    ? Math.min(typed, max)
    : lastValid.current;
  const numericValue = effective == null ? null : parseGlucoseInput(effective);
  const canSubmit = Number.isFinite(numericValue) && numericValue > 0 && !logging;

  const handleValueChange = (next) => {
    setValue(next);
    const n = Number(next);
    // Remember the newest sensible value so a cleared field can fall back to it.
    if (Number.isFinite(n) && n > 0) lastValid.current = Math.min(n, max);
  };

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

    // Settle the field on the value that will be saved: capped at the ceiling,
    // and restored to the last valid value if it was left empty.
    setValue(effective.toFixed(decimals));
    lastValid.current = effective;

    navigator.vibrate?.(20);
    setLogging(true);

    const submittedReading = {
      value: numericValue,
      recorded_at: dt.toISOString(),
      source: "manual",
      notes: notes || undefined,
    };
    const optimisticReading = {
      ...submittedReading,
      id: `optimistic-glucose-${Date.now()}`,
      created_date: new Date().toISOString(),
    };

    createGlucose.mutate(
      { submittedReading, optimisticReading },
      {
        onSuccess: () => {
          setLogging(false);
          onClose?.();
          const targetHigh = Number(window.localStorage.getItem("target_range_high") || 180);
          if (Number.isFinite(numericValue) && numericValue > targetHigh) {
            toast("That's above your comfort zone.");
          }
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
      title="Log Reading"
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
          style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
        >
          {logging ? "Logging..." : `Log ${effective == null ? "--" : effective.toFixed(decimals)} ${glucoseUnitLabel()}`}
        </button>
      }
    >
      <div className="space-y-4">
        <StepperField
          label={`Glucose (${glucoseUnitLabel()})`}
          value={value}
          onChange={handleValueChange}
          step={step}
          presets={presets}
          max={max}
          decimals={decimals}
          ariaLabel="Glucose value"
        />
        <TimeField
          dateValue={date}
          timeValue={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          maxDate={getTodayDateValue()}
          maxTime={date === getTodayDateValue() ? new Date().toTimeString().slice(0, 5) : undefined}
        />
        <TextField label="Notes" value={notes} onChange={setNotes} placeholder="e.g. fasting, after meal" multiline />
      </div>
    </LogSheetShell>
  );
}