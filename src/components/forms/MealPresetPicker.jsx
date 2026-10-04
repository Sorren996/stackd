import { useQueryClient } from "@tanstack/react-query";
import { FOOD_DATABASE } from "@/lib/carbAbsorption";
import { FieldLabel, COPPER, CREAM, CANVAS, TAUPE } from "@/components/forms/FieldKit";

// Recent meals first (from the already-loaded log cache), then a few common
// foods, so presets are useful from day one.
function buildPresets(entries) {
  const seen = new Set();
  const list = [];
  for (const e of entries || []) {
    const name = String(e.food_name || "").trim();
    if (!name || e.is_rescue_carb || seen.has(name.toLowerCase()) || !(Number(e.carbs) > 0)) continue;
    seen.add(name.toLowerCase());
    list.push({ name, carbs: Number(e.carbs), fat: e.fat_grams, protein: e.protein_grams });
    if (list.length >= 4) break;
  }
  for (const f of FOOD_DATABASE) {
    if (list.length >= 6) break;
    if (f.category === "Fast Absorbing" || seen.has(f.name.toLowerCase())) continue;
    seen.add(f.name.toLowerCase());
    list.push({ name: f.name, carbs: f.carbs });
  }
  return list;
}

/** Preset chips + a "Custom meal" chip that clears to free-text entry. */
export default function MealPresetPicker({ selectedName, onPick, onCustom }) {
  const queryClient = useQueryClient();
  const presets = buildPresets(queryClient.getQueryData(["carb-entries"]));
  const isPreset = presets.some((p) => p.name === selectedName);

  const chip = (key, label, active, onClick) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="rounded-full px-4 text-sm font-semibold"
      style={{ height: 40, background: active ? COPPER : CANVAS, color: active ? CREAM : TAUPE }}
      aria-pressed={active}
    >
      {label}
    </button>
  );

  return (
    <div>
      <FieldLabel>Quick picks</FieldLabel>
      <div className="mt-2.5 flex flex-wrap gap-2" style={{ touchAction: "pan-y" }}>
        {chip("custom", "Custom meal", !isPreset, onCustom)}
        {presets.map((p) => chip(p.name, `${p.name} · ${Math.round(p.carbs)}g`, selectedName === p.name, () => onPick(p)))}
      </div>
    </div>
  );
}