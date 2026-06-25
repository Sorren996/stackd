import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Dialog, DialogPortal, DialogOverlay, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { X, Syringe, Droplets, Wheat, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import CarbsTab from "@/components/CarbsTab";
const CATEGORY_ORDER = [
  "Rapid-Acting",
  "Short-Acting",
  "Intermediate",
  "Long-Acting",
  "Ultra Long-Acting",
];

const groupedInsulins = CATEGORY_ORDER.reduce((groups, category) => {
  const items = Object.entries(INSULIN_PROFILES).filter(([, profile]) => profile.category === category);
  if (items.length) groups.push({ category, items });
  return groups;
}, []);

function createInsulinRow(defaults = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    insulinType: "",
    units: "",
    purpose: "meal",
    ...defaults,
  };
}

function readLightMode() {
  return localStorage.getItem("theme") === "light";
}

export default function DoseForm({ open, onOpenChange }) {
  const [tab, setTab] = useState("insulin");
  const [isLightMode, setIsLightMode] = useState(readLightMode);
  const [insulinRows, setInsulinRows] = useState(() => [createInsulinRow()]);
  const [insulinNotes, setInsulinNotes] = useState("");
  const [insulinTime, setInsulinTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [glucoseValue, setGlucoseValue] = useState("");
  const [glucoseNotes, setGlucoseNotes] = useState("");
  const [glucoseTime, setGlucoseTime] = useState(() => new Date().toTimeString().slice(0, 5));

  const queryClient = useQueryClient();
  const nowTimeString = new Date().toTimeString().slice(0, 5);

  useEffect(() => {
    const refreshTheme = () => setIsLightMode(readLightMode());
    window.addEventListener("app-theme-changed", refreshTheme);
    window.addEventListener("storage", refreshTheme);

    return () => {
      window.removeEventListener("app-theme-changed", refreshTheme);
      window.removeEventListener("storage", refreshTheme);
    };
  }, []);

  const createDoses = useMutation({
    mutationFn: (doses) => base44.entities.InsulinDose.bulkCreate(doses),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Insulin logged - tracking activity now");
      onOpenChange(false);
      setInsulinRows([createInsulinRow()]);
      setInsulinNotes("");
      setInsulinTime(new Date().toTimeString().slice(0, 5));
    },
    onError: () => toast.error("Unable to log insulin. Please try again."),
  });

  const createGlucose = useMutation({
    mutationFn: (data) => base44.entities.GlucoseReading.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Glucose logged");
      onOpenChange(false);
      setGlucoseValue("");
      setGlucoseNotes("");
      setGlucoseTime(new Date().toTimeString().slice(0, 5));
    },
  });

const createCarb = useMutation({
  mutationFn: async (entries) => {
    const normalizedEntries = entries.map((entry) => {
      const absorptionProfile = entry.absorption_profile || entry.profile || "medium";
      const categoryByProfile = {
        fast: "Fast Absorbing",
        medium: "Medium Absorbing",
        slow: "Slow Absorbing",
      };

      return {
        name: entry.name || "Estimated meal",
        carbs: Number(entry.carbs) || 0,
        gi: Number(entry.gi) || 50,
        category: entry.category || categoryByProfile[absorptionProfile] || "Medium Absorbing",
        profile: absorptionProfile,
        absorption_profile: absorptionProfile,
        consumed_at: entry.consumed_at || new Date().toISOString(),
        is_custom: false,
      };
    });

    console.log("Saving carb entries", normalizedEntries);
    toast.message("Sending carb entry...");

    const savePromise = base44.entities.CarbEntry.bulkCreate(normalizedEntries);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Carb save timed out after 10 seconds")), 10000);
    });

    return Promise.race([savePromise, timeoutPromise]);
  },
  onSuccess: (result, entries) => {
    console.log("Carb entries saved", result);
queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
queryClient.invalidateQueries({ queryKey: ["carbs"] });
queryClient.invalidateQueries({ queryKey: ["CarbEntry"] });
queryClient.invalidateQueries();    toast.success(`Logged ${entries.length} food item${entries.length === 1 ? "" : "s"}`);
    toast.success(`Logged ${entries[0]?.carbs ?? "?"}g carbs`);
    onOpenChange(false);
  },
  onError: (error) => {
    console.error("Unable to log carbs", error);
    toast.error(error?.message || "Unable to log carbs. Please check the carb entry fields.");
  },
});
  const updateInsulinRow = (id, patch) => {
    setInsulinRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addInsulinRow = () => {
    const previous = insulinRows[insulinRows.length - 1];
    setInsulinRows((rows) => [
      ...rows,
      createInsulinRow({
        insulinType: previous?.insulinType || "",
        purpose: previous?.purpose || "meal",
      }),
    ]);
  };

  const removeInsulinRow = (id) => {
    setInsulinRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== id)));
  };

  const insulinTotals = insulinRows.reduce((totals, row) => {
    const units = Number(row.units);
    if (!row.insulinType || !Number.isFinite(units) || units <= 0) return totals;

    totals[row.insulinType] = (totals[row.insulinType] || 0) + units;
    return totals;
  }, {});

  const totalUnits = Object.values(insulinTotals).reduce((sum, units) => sum + units, 0);

  const handleSubmitInsulin = () => {
    const invalidRow = insulinRows.find((row) => {
      const units = Number(row.units);
      return !row.insulinType || !Number.isFinite(units) || units <= 0;
    });

    if (invalidRow) {
      toast.error("Choose an insulin type and enter units for every row.");
      return;
    }

    const [hours, minutes] = insulinTime.split(":").map(Number);
    const administeredAt = new Date();
    administeredAt.setHours(hours, minutes, 0, 0);

    const groupedDoses = insulinRows.reduce((groups, row) => {
      const units = Number(row.units);
      const existing = groups[row.insulinType] || {
        insulin_type: row.insulinType,
        units: 0,
        meal_units: 0,
        correction_units: 0,
        administered_at: administeredAt.toISOString(),
        notes: insulinNotes || undefined,
      };

      existing.units += units;
      if (row.purpose === "correction") {
        existing.correction_units += units;
      } else {
        existing.meal_units += units;
      }

      groups[row.insulinType] = existing;
      return groups;
    }, {});

    createDoses.mutate(Object.values(groupedDoses));
  };

  const handleSubmitGlucose = () => {
    const value = Number(glucoseValue);
    if (!Number.isFinite(value) || value <= 0) return;

    const [hours, minutes] = glucoseTime.split(":").map(Number);
    const recordedAt = new Date();
    recordedAt.setHours(hours, minutes, 0, 0);

    createGlucose.mutate({
      value,
      recorded_at: recordedAt.toISOString(),
      notes: glucoseNotes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        {isLightMode && (
          <style>{`
            .dose-form-light [class~="text-white"] { color: #29433a !important; }
            .dose-form-light [class*="text-white/"] { color: rgba(41, 67, 58, 0.6) !important; }
            .dose-form-light [class*="border-white"] { border-color: rgba(32, 90, 76, 0.14) !important; }
            .dose-form-light [class*="bg-white/"] { background-color: rgba(255,255,255,0.64) !important; }
            .dose-form-light input,
            .dose-form-light select,
            .dose-form-light textarea { color: #29433a !important; }
            .dose-form-light input::placeholder,
            .dose-form-light textarea::placeholder { color: rgba(41, 67, 58, 0.42) !important; }
            .dose-form-light select option,
            .dose-form-light select optgroup { background: #edf5f2; color: #29433a; }
            .dose-form-light [class*="text-teal-"] { color: #237b70 !important; }
            .dose-form-light [class*="text-orange-"],
            .dose-form-light [class*="text-amber-"] { color: #a96821 !important; }
          `}</style>
        )}
        <DialogOverlay
          className="fixed inset-0 z-50 backdrop-blur-sm"
          style={{ background: isLightMode ? "rgba(30, 63, 53, 0.18)" : "rgba(0, 0, 0, 0.75)" }}
        />
        <DialogPrimitive.Content
          className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/5 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl ${isLightMode ? "dose-form-light" : ""}`}
          style={{
            background: isLightMode
              ? "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(236,246,242,0.96))"
              : "hsl(162,10%,8%)",
            borderColor: isLightMode ? "rgba(32,90,76,0.16)" : undefined,
          }}
        >
          <div className="flex items-center justify-between px-6 pb-3 pt-5">
            <div className="w-8" />
            <span className="text-lg font-semibold text-white">Log Entry</span>
            <DialogClose asChild>
              <button className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </DialogClose>
          </div>

          <div className="mx-5 mb-2 flex rounded-2xl bg-white/[0.06] p-1">
            {[
              { id: "insulin", label: "Insulin", Icon: Syringe },
              { id: "glucose", label: "Glucose", Icon: Droplets },
              { id: "carbs", label: "Carbs", Icon: Wheat },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-colors ${
                  tab === id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {tab === "carbs" ? (
            <div className="min-h-[580px]">
<CarbsTab onSubmit={(entries) => createCarb.mutate(entries)} isPending={createCarb.isPending} />
            </div>
          ) : tab === "insulin" ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
                <div className="space-y-3">
                  <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Insulin doses</p>

                  {insulinRows.map((row, index) => (
                    <div key={row.id} className="space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_6.75rem] gap-2">
                        <select
                          aria-label={`Insulin type for dose ${index + 1}`}
                          value={row.insulinType}
                          onChange={(event) => updateInsulinRow(row.id, { insulinType: event.target.value })}
                          className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-teal-400"
                        >
                          <option value="" className="bg-[#18211f]">Insulin type</option>
                          {groupedInsulins.map(({ category, items }) => (
                            <optgroup key={category} label={category} className="bg-[#18211f]">
                              {items.map(([name]) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>

                        <input
                          aria-label={`Units for dose ${index + 1}`}
                          type="number"
                          min="0.1"
                          step="0.1"
                          inputMode="decimal"
                          placeholder="Units"
                          value={row.units}
                          onChange={(event) => updateInsulinRow(row.id, { units: event.target.value })}
                          className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-center text-sm text-white outline-none placeholder:text-white/30 focus:border-teal-400"
                        />

                        <select
                          aria-label={`Purpose for dose ${index + 1}`}
                          value={row.purpose}
                          onChange={(event) => updateInsulinRow(row.id, { purpose: event.target.value })}
                          className="rounded-xl border border-white/10 bg-white/5 px-2 py-3 text-sm text-white outline-none focus:border-teal-400"
                        >
                          <option value="meal" className="bg-[#18211f]">Meal</option>
                          <option value="correction" className="bg-[#18211f]">Correction</option>
                        </select>
                      </div>

                      {insulinRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInsulinRow(row.id)}
                          className="flex items-center gap-1 px-1 text-xs text-white/35 transition hover:text-red-300"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove this row
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addInsulinRow}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-sm font-medium text-white/60 transition hover:border-teal-400/50 hover:bg-teal-400/5 hover:text-teal-300"
                  >
                    <Plus className="h-4 w-4" />
                    Add more insulin
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Time administered</p>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-sm text-white/40">Administered at</span>
                    <input
                      type="time"
                      value={insulinTime}
                      max={nowTimeString}
                      onChange={(event) => {
                        if (event.target.value <= nowTimeString) setInsulinTime(event.target.value);
                      }}
                      className="cursor-pointer bg-transparent text-sm font-medium text-white outline-none"
                      style={{ colorScheme: isLightMode ? "light" : "dark" }}
                    />
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Notes (optional)</p>
                  <Textarea
                    value={insulinNotes}
                    onChange={(event) => setInsulinNotes(event.target.value)}
                    placeholder="e.g. before lunch"
                    rows={2}
                    className="resize-none rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>

                <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
                  {Object.entries(insulinTotals).length ? (
                    Object.entries(insulinTotals).map(([type, units]) => (
                      <p key={type} className="text-sm font-semibold text-white/85">
                        {type.split(" ")[0]} {units % 1 === 0 ? units : units.toFixed(1)} units total
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-white/35">Add an insulin dose to see the total.</p>
                  )}
                </div>
              </div>

              <div className="shrink-0 px-5 pb-6 pt-3">
                <button
                  type="button"
                  onClick={handleSubmitInsulin}
                  disabled={!totalUnits || createDoses.isPending}
                  className="w-full rounded-2xl bg-teal-500 py-4 text-base font-semibold text-white transition hover:bg-teal-400 disabled:opacity-40"
                >
                  {createDoses.isPending
                    ? "Logging..."
                    : totalUnits
                      ? `Log ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(1)} units`
                      : "Add insulin units"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
                <label htmlFor="glucose-log" className="block text-sm font-bold uppercase tracking-widest text-white/40">
                  Blood glucose (mg/dL)
                </label>
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-6 py-6">
                  <input
                    id="glucose-log"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={3}
                    value={glucoseValue}
                    onChange={(event) => setGlucoseValue(event.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="--"
                    className="w-full bg-transparent text-center text-5xl font-bold text-white outline-none placeholder:text-white/20"
                  />
                  <p className="mt-1 text-center text-sm text-white/40">mg/dL</p>
                </div>

                <div className="mt-6 space-y-3">
                  <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Time</p>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-sm text-white/40">Reading time</span>
                    <input
                      type="time"
                      value={glucoseTime}
                      max={nowTimeString}
                      onChange={(event) => {
                        if (event.target.value <= nowTimeString) setGlucoseTime(event.target.value);
                      }}
                      className="cursor-pointer bg-transparent text-sm font-medium text-white outline-none"
                      style={{ colorScheme: isLightMode ? "light" : "dark" }}
                    />
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Notes (optional)</p>
                  <Textarea
                    value={glucoseNotes}
                    onChange={(event) => setGlucoseNotes(event.target.value)}
                    placeholder="e.g. fasting, after meal"
                    rows={2}
                    className="resize-none rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="shrink-0 px-5 pb-6 pt-3">
                <button
                  type="button"
                  onClick={handleSubmitGlucose}
                  disabled={!glucoseValue || createGlucose.isPending}
                  className="w-full rounded-2xl bg-orange-600 py-4 text-base font-semibold text-white transition hover:bg-orange-500 disabled:opacity-40"
                >
                  {createGlucose.isPending ? "Logging..." : `Log ${glucoseValue || "--"} mg/dL`}
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
