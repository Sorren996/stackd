import { useEffect, useState } from "react";
import { useCreateGlucose } from "@/hooks/useLogMutations";
import { getGlucoseUnits, glucoseUnitLabel, parseGlucoseInput } from "@/lib/glucoseUnits";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  StepperField,
  TimeField,
  TextField,
  COPPER,
  CREAM,
} from "@/components/forms/FieldKit";

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
  const [date, setDate] = useState(getTodayDateValue);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [glucoseUnits, setGlucoseUnits] = useState(getGlucoseUnits);
  const [logging, setLogging] = useState(false);

  const createGlucose = useCreateGlucose();

  useEffect(() => {
    if (!open) return;
    setValue("");
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

  // mmol/L uses smaller step (0.1) and presets; mg/dL uses 5/10.
  const isMmol = glucoseUnits === "mmol/L";
  const step = isMmol ? 1 : 5; // stepper is integer-friendly; mmol handled below
  const presets = isMmol ? [] : [70, 100, 130, 180];

  const numericValue = parseGlucoseInput(value);
  const canSubmit = Number.isFinite(numericValue) && numericValue > 0 && !logging;

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

    const submittedReading = {
      value: numericValue,
      recorded_at: dt.toISOString(),
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

  // For mmol/L the integer stepper is awkward; fall back to a text input feel
  // by letting the user type via the TextField. For mg/dL use the stepper.
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
          {logging ? "Logging..." : `Log ${value || "--"} ${glucoseUnitLabel()}`}
        </button>
      }
    >
      <div className="space-y-4">
        {isMmol ? (
          <TextField label={`Glucose (${glucoseUnitLabel()})`} value={value} onChange={(v) => setValue(v.replace(/[^\d.]/g, "").slice(0, 4))} placeholder="e.g. 6.5" />
        ) : (
          <StepperField label={`Glucose (${glucoseUnitLabel()})`} value={value} onChange={setValue} step={5} presets={presets} />
        )}
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