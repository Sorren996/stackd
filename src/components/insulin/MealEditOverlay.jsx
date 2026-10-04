import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import EditSheetShell from "@/components/edit/EditSheetShell";

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
 * Self-contained edit sheet for all carb items in a meal group, using the
 * shared viewport-safe EditSheetShell (portaled to document.body). Writes
 * directly to CarbEntry records (update / create / delete) and invalidates
 * the shared react-query caches so the dashboard chart, Meal Review focal
 * number, and absorption track all refresh from one source.
 *
 * - Meal-level native time input; changing the time moves the meal marker
 *   on the graph (all items share the new consumed_at).
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

  return (
    <>
      <EditSheetShell
        open={!!entries}
        onClose={onClose}
        title="Edit meal items"
        footer={
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
            style={{ background: "#9c5228", color: "#f7f1e8", boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
          >
            {isSaving ? "Saving..." : "Save meal"}
          </button>
        }
      >
        {/* Meal-level time input — native input, moves the meal marker on save */}
        <div className="mb-4">
          <label
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: PALETTE.faint }}
          >
            <Clock className="h-3 w-3" />
            Meal time
          </label>
          <input
            type="time"
            value={mealTime}
            onChange={(e) => setMealTime(e.target.value)}
            className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-medium tabular-nums outline-none transition"
            style={{
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box",
              background: PALETTE.canvas,
              color: PALETTE.ink,
              border: `1px solid ${PALETTE.hairline}`,
            }}
          />
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="rounded-2xl p-3"
              style={{ background: PALETTE.canvas, border: `1px solid ${PALETTE.hairline}` }}
            >
              {/* Row 1 — food name, full width */}
              <input
                type="text"
                value={item.food_name}
                onChange={(e) => updateItem(index, "food_name", e.target.value)}
                placeholder="Food name"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none transition"
                style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", background: PALETTE.surface, color: PALETTE.ink }}
              />
              {/* Row 2 — carbs input + remove button */}
              <div className="mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={item.carbs}
                    onChange={(e) => updateItem(index, "carbs", e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl px-3 py-2.5 pr-8 text-sm outline-none transition"
                    style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box", background: PALETTE.surface, color: PALETTE.ink }}
                  />
                  <span
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                    style={{ color: PALETTE.faint }}
                  >
                    g
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => requestRemove(index)}
                  disabled={isDeleting}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition hover:opacity-70 disabled:opacity-40"
                  style={{ background: PALETTE.surface, color: PALETTE.danger, border: `1px solid ${PALETTE.hairline}` }}
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-medium transition hover:opacity-70"
            style={{ background: PALETTE.canvas, color: PALETTE.muted }}
          >
            <Plus className="h-4 w-4" />
            Add item
          </button>
        </div>
      </EditSheetShell>

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