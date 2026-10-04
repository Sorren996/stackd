import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { useCreateDoses } from "@/hooks/useLogMutations";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  StepperField,
  SegmentedControl,
  TimeField,
  TextField,
  INK,
  COPPER,
  CREAM,
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
 * Log Insulin form — uses the shared LogSheetShell and field kit.
 * The insulin type segmented control shows ONLY the types the user has
 * configured in their insulin settings (their personal list — never a fixed
 * Rapid/Short/Intermediate/Long set). No dose estimates or recommendations.
 */
export default function LogInsulinForm({ open, onClose }) {
  const [insulinType, setInsulinType] = useState("");
  const [units, setUnits] = useState("");
  const [date, setDate] = useState(getTodayDateValue);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [insulinLibrary, setInsulinLibrary] = useState(readInsulinLibrary);
  const [logging, setLogging] = useState(false);

  const queryClient = useQueryClient();
  const createDoses = useCreateDoses();

  useEffect(() => {
    if (!open) return;
    setInsulinType("");
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
        .map(([name, profile]) => ({ value: name, label: name, color: profile.color })),
    [insulinLibrary]
  );

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
      title="Log Insulin"
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
          style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
        >
          {logging
            ? "Saving..."
            : totalUnits
              ? `Save ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(1)} units`
              : "Add insulin"}
        </button>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          label="Insulin Type"
          value={insulinType}
          onChange={setInsulinType}
          options={typeOptions}
          ariaLabel="Insulin type"
        />
        <StepperField
          label="Units"
          value={units}
          onChange={setUnits}
          unit="U"
          step={1}
          presets={[5, 10, 15, 20]}
        />
        <TimeField
          dateValue={date}
          timeValue={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          maxDate={getTodayDateValue()}
          maxTime={date === getTodayDateValue() ? new Date().toTimeString().slice(0, 5) : undefined}
        />
        <TextField
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder={insulinType && /lantus|tresiba|degludec|levemir|detemir|nph|humulin n|novolin n|icodec|awiqli|basaglar|semglee|rezvoglar|toujeo/i.test(insulinType) ? "e.g. morning dose" : "e.g. before lunch"}
          multiline
        />
      </div>
    </LogSheetShell>
  );
}