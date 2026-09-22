import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
  surface: "#fdf9f2",
  canvas: "#f7f1e8",
  danger: "#9c3f2e",
};

/**
 * Self-contained floating overlay for editing all carb items in a meal group.
 * Writes directly to CarbEntry records (update / create / delete) and
 * invalidates the shared react-query caches so the dashboard chart, Meal
 * Review focal number, and absorption track all refresh from one source.
 *
 * Used from both the Activity Graph meal marker and the Meal Review
 * "Edit items" trigger — ensuring a single consistent edit path.
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
  const [isSaving, setIsSaving] = useState(false);

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

  const removeItem = (index) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const save = async () => {
    const validItems = items.filter(
      (i) => i.food_name.trim() && Number(i.carbs) > 0
    );
    if (!validItems.length) {
      toast.error("Add at least one item with a name and carb amount.");
      return;
    }

    setIsSaving(true);
    try {
      const originalIds = (entries || []).map((e) => e.id).filter(Boolean);
      const currentIds = validItems.filter((i) => i.id).map((i) => i.id);
      const deletedIds = originalIds.filter((id) => !currentIds.includes(id));

      for (const id of deletedIds) {
        await base44.entities.CarbEntry.delete(id);
      }

      for (const item of validItems.filter((i) => i.id)) {
        await base44.entities.CarbEntry.update(item.id, {
          food_name: item.food_name.trim(),
          carbs: Number(item.carbs),
        });
      }

      for (const item of validItems.filter((i) => !i.id)) {
        await base44.entities.CarbEntry.create({
          food_name: item.food_name.trim(),
          carbs: Number(item.carbs),
          consumed_at: item.consumed_at,
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
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto px-3 pb-24 pt-6 sm:items-center sm:px-4 sm:pb-6"
      style={{ background: "rgba(63, 56, 48, 0.25)" }}
      onClick={onClose}
    >
      <div
        className="meal-edit-overlay max-h-[calc(100dvh-8rem)] w-full max-w-md overflow-y-auto rounded-3xl p-5 sm:max-h-[calc(100dvh-3rem)]"
        style={{
          background: PALETTE.surface,
          boxShadow: "0 8px 28px rgba(63, 56, 48, 0.12), 0 2px 8px rgba(63, 56, 48, 0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`.meal-edit-overlay input { font-size: 16px; }`}</style>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: PALETTE.ink }}>
            Edit meal items
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ background: PALETTE.canvas, color: PALETTE.muted }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item.food_name}
                onChange={(e) => updateItem(index, "food_name", e.target.value)}
                placeholder="Food name"
                className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none transition"
                style={{ background: PALETTE.canvas, color: PALETTE.ink }}
              />
              <div className="relative w-24">
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.carbs}
                  onChange={(e) => updateItem(index, "carbs", e.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl px-3 py-2.5 pr-8 text-sm outline-none transition"
                  style={{ background: PALETTE.canvas, color: PALETTE.ink }}
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
                onClick={() => removeItem(index)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:opacity-70"
                style={{ background: PALETTE.canvas, color: PALETTE.danger }}
                aria-label="Remove item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addItem}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition hover:opacity-70"
            style={{ background: PALETTE.canvas, color: PALETTE.muted }}
          >
            <Plus className="h-4 w-4" />
            Add item
          </button>

          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="sticky bottom-0 w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
            style={{ background: PALETTE.ink, color: "#f7f1e8", boxShadow: "0 4px 16px rgba(63, 56, 48, 0.15)" }}
          >
            {isSaving ? "Saving..." : "Save meal"}
          </button>
        </div>
      </div>
    </div>
  );
}