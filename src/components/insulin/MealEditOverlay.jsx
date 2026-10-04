import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  TextField,
  TapStepper,
  NowTimeField,
  COPPER,
  CREAM,
  FAINT,
} from "@/components/forms/FieldKit";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
  surface: "#fdf9f2",
  canvas: "#f7f1e8",
  danger: "#9c3f2e",
};

// Convert an ISO consumed_at to "HH:MM" in the user's local timezone, for the
// native <input type="time"> value.
function toTimeInputValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toDateInputValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Apply a new "HH:MM" time onto an existing ISO date, preserving the local
// date and timezone. Returns a new ISO string.
function applyNewTimeToISO(originalISO, timeValue) {
  if (!originalISO || !timeValue) return originalISO;
  const d = new Date(originalISO);
  if (isNaN(d.getTime())) return originalISO;
  const [hours, minutes] = timeValue.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return originalISO;
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/**
 * Self-contained edit sheet for all carb items in a meal group, on the shared
 * LogSheetShell (same drag-to-dismiss sheet, sticky Cancel header, and sticky
 * "Save changes" footer as the create forms). Writes directly to CarbEntry
 * records (update / create / delete) and invalidates the shared react-query
 * caches so the dashboard chart, Meal Review focal number, and absorption
 * track all refresh from one source.
 *
 * - Meal-level time field (date + time, defaulting to the meal's current
 *   value); changing the time moves the meal marker on the graph (all items
 *   share the new consumed_at).
 * - Each item uses the same FieldKit components as the create form (name text
 *   field + 5g carb stepper), prefilled with the record's current values.
 * - Deleting the last remaining item deletes the entire meal log and closes
 *   the sheet automatically.
 */
export default function MealEditOverlay({ entries, onClose }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState(() =>
    (entries || []).map((e) => ({
      id: e.id || null,
      food_name: e.food_name || e.name || "",
      carbs: String(e.carbs ?? ""),
      consumed_at: e.consumed_at,
    }))
  );
  const [mealDate, setMealDate] = useState(() => toDateInputValue(entries?.[0]?.consumed_at));
  const [mealTime, setMealTime] = useState(() => toTimeInputValue(entries?.[0]?.consumed_at));
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const updateItem = (index, field, value) => {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      {
        id: null,
        food_name: "",
        carbs: "",
        consumed_at: entries[0]?.consumed_at || new Date().toISOString(),
      },
    ]);
  };

  const requestRemove = (index) => setPendingDelete(index);
  const cancelRemove = () => setPendingDelete(null);

  const confirmRemove = async () => {
    const index = pendingDelete;
    if (index == null) return;
    const item = items[index];
    const isLastItem = items.length === 1;
    setPendingDelete(null);

    // Unsaved item (no record yet) — just drop it from local state.
    if (!item?.id) {
      setItems((current) => current.filter((_, i) => i !== index));
      if (isLastItem) onClose();
      return;
    }

    setIsDeleting(true);
    try {
      await base44.entities.CarbEntry.delete(item.id);
      setItems((current) => current.filter((_, i) => i !== index));
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      queryClient.invalidateQueries({ queryKey: ["history-summary"] });
      toast.success("Item removed");
      // Last food item deleted → the entire meal log is gone. Close the
      // sheet so the graph and all views refresh without an empty editor.
      if (isLastItem) {
        onClose();
        return;
      }
    } catch {
      toast.error("Unable to remove item. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const save = async () => {
    const validItems = items.filter(
      (i) => i.food_name.trim() && Number(i.carbs) > 0
    );
    if (!validItems.length) {
      toast.error("Add at least one item with a name and carb amount.");
      return;
    }

    // If the time changed, compute a new consumed_at applied to every item
    // so the meal marker moves on the graph.
    const originalTime = toTimeInputValue(entries?.[0]?.consumed_at);
    const timeChanged = mealTime && originalTime && mealTime !== originalTime;
    const newConsumedAt = timeChanged
      ? applyNewTimeToISO(entries[0].consumed_at, mealTime)
      : null;

    setIsSaving(true);
    try {
      for (const item of validItems.filter((i) => i.id)) {
        const update = {
          food_name: item.food_name.trim(),
          carbs: Number(item.carbs),
        };
        if (newConsumedAt) update.consumed_at = newConsumedAt;
        await base44.entities.CarbEntry.update(item.id, update);
      }

      for (const item of validItems.filter((i) => !i.id)) {
        await base44.entities.CarbEntry.create({
          food_name: item.food_name.trim(),
          carbs: Number(item.carbs),
          consumed_at: newConsumedAt || item.consumed_at,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      queryClient.invalidateQueries({ queryKey: ["history-summary"] });
      toast.success("Meal updated");
      onClose();
    } catch {
      toast.error("Unable to update meal. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const todayDateValue = getTodayDateValue();
  const nowTimeString = new Date().toTimeString().slice(0, 5);

  return (
    <>
      <LogSheetShell
        open={!!entries}
        onClose={onClose}
        title="Edit meal items"
        footer={
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
            style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
          >
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        }
      >
        <div className="space-y-5">
          {/* Meal-level time field — date + time, moves the meal marker on save */}
          <div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" style={{ color: FAINT }} />
              <span
                style={{
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  fontWeight: 700,
                  fontSize: "10px",
                  color: FAINT,
                }}
              >
                Meal time
              </span>
            </div>
            <div className="mt-1.5">
              <NowTimeField
                dateValue={mealDate}
                timeValue={mealTime}
                onDateChange={setMealDate}
                onTimeChange={setMealTime}
                maxDate={todayDateValue}
                maxTime={mealDate === todayDateValue ? nowTimeString : undefined}
              />
            </div>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="rounded-2xl p-4"
                style={{ background: PALETTE.canvas, border: `1px solid ${PALETTE.hairline}` }}
              >
                <TextField
                  value={item.food_name}
                  onChange={(value) => updateItem(index, "food_name", value)}
                  placeholder="Food name"
                />
                <div className="mt-3">
                  <TapStepper
                    label="Carbs"
                    sub="· steps of 5g · tap to type"
                    value={item.carbs}
                    onChange={(value) => updateItem(index, "carbs", value)}
                    unit="g"
                    step={5}
                    presets={[15, 30, 45, 60]}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => requestRemove(index)}
                  disabled={isDeleting}
                  className="mt-3 flex items-center gap-1.5 text-sm font-medium transition hover:opacity-70 disabled:opacity-40"
                  style={{ color: PALETTE.danger }}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove item
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addItem}
              className="flex w-full items-center justify-center gap-1.5 rounded-2xl py-3.5 text-sm font-medium transition hover:opacity-70"
              style={{ background: PALETTE.canvas, color: PALETTE.muted, border: `1px solid ${PALETTE.hairline}` }}
            >
              <Plus className="h-4 w-4" />
              Add item
            </button>
          </div>
        </div>
      </LogSheetShell>

      {pendingDelete != null && (
        <DeleteConfirmDialog
          itemName={items[pendingDelete]?.food_name}
          title="Are you sure?"
          message="This will permanently remove this item from your meal log."
          confirmLabel="Remove"
          cancelLabel="Keep it"
          onCancel={cancelRemove}
          onConfirm={confirmRemove}
        />
      )}
    </>
  );
}