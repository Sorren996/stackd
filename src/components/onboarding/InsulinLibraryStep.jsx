import { useState, useMemo } from "react";
import { Check } from "lucide-react";
import OnboardingShell from "@/components/onboarding/OnboardingShell";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";

const INK = "#3f3830";
const COPPER = "#9c5228";
const CREAM = "#fdf9f2";
const CANVAS = "#f7f1e8";
const HAIRLINE = "#eadccf";
const FAINT = "#746959";
const TAUPE = "#6b6153";

const CATEGORY_ORDER = ["Rapid", "Short", "Intermediate", "Long", "Premixed"];
const CATEGORY_LABELS = {
  Rapid: "Rapid-acting",
  Short: "Short-acting",
  Intermediate: "Intermediate-acting",
  Long: "Long-acting",
  Premixed: "Premixed",
};

function groupKeyFor(category) {
  if (category === "Rapid-Acting") return "Rapid";
  if (category === "Short-Acting") return "Short";
  if (category === "Intermediate-Acting") return "Intermediate";
  if (category === "Long-Acting" || category === "Ultra-Long-Acting") return "Long";
  if (category === "Premixed") return "Premixed";
  return "Rapid";
}

/**
 * Step 1 — Insulin Library (required, cannot skip).
 * Lets the user select which insulins they use and mark which are for
 * meal/correction dosing vs background. At least one must be selected.
 */
export default function InsulinLibraryStep({ onContinue, onBack }) {
  const [selected, setSelected] = useState(new Set());
  const [mealTypes, setMealTypes] = useState(new Set());
  const [showBackNote, setShowBackNote] = useState(false);

  const grouped = useMemo(() => {
    const map = {};
    for (const [name, profile] of Object.entries(INSULIN_PROFILES)) {
      const key = groupKeyFor(profile.category);
      if (!map[key]) map[key] = [];
      map[key].push(name);
    }
    return CATEGORY_ORDER.filter((k) => map[k]).map((k) => ({ key: k, items: map[k] }));
  }, []);

  const toggle = (name) => {
    const next = new Set(selected);
    const profile = INSULIN_PROFILES[name];
    if (next.has(name)) {
      next.delete(name);
      const meals = new Set(mealTypes);
      meals.delete(name);
      setMealTypes(meals);
    } else {
      next.add(name);
      // Default: rapid/short-acting → meal, others → background
      if (profile && ["Rapid-Acting", "Short-Acting"].includes(profile.category)) {
        setMealTypes(new Set([...mealTypes, name]));
      }
    }
    setSelected(next);
  };

  const toggleMealType = (name) => {
    const next = new Set(mealTypes);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setMealTypes(next);
  };

  const handleContinue = () => {
    if (selected.size === 0) return;
    onContinue({
      insulin_library: [...selected],
      meal_insulin_types: [...mealTypes],
    });
  };

  const handleBack = () => {
    setShowBackNote(true);
  };

  return (
    <OnboardingShell
      stepLabel="Step 1 of 3"
      onBack={handleBack}
      title={
        <>
          Your{" "}
          <em style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 400 }}>
            insulin
          </em>
        </>
      }
      intro="Select the insulin(s) you use. This shapes your logging and activity insights."
      notice={
        showBackNote ? (
          <div
            className="mb-4 rounded-2xl px-4 py-3"
            style={{ background: "rgba(156,82,40,0.08)", border: "1px solid rgba(156,82,40,0.20)" }}
          >
            <p className="text-[12px] leading-relaxed" style={{ color: COPPER }}>
              Your insulin selection is needed to continue. You can always change it later in Settings.
            </p>
          </div>
        ) : null
      }
      footer={
        <button
          type="button"
          onClick={handleContinue}
          disabled={selected.size === 0}
          className="w-full rounded-full py-3.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40"
          style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.28)" }}
        >
          {selected.size === 0 ? "Select at least one" : `Continue (${selected.size} selected)`}
        </button>
      }
    >
      <div className="min-w-0">
        {grouped.map(({ key, items }) => (
          <div key={key} className="mb-4">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
              style={{ color: FAINT }}
            >
              {CATEGORY_LABELS[key]}
            </div>
            <div
              className="rounded-2xl overflow-hidden"
              style={{ background: CREAM, border: `1px solid ${HAIRLINE}` }}
            >
              {items.map((name, idx) => {
                const isSelected = selected.has(name);
                const isMeal = mealTypes.has(name);
                return (
                  <div
                    key={name}
                    style={{
                      borderBottom: idx < items.length - 1 ? `1px solid ${HAIRLINE}` : "none",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(name)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                    >
                      <span className="text-[14px]" style={{ color: isSelected ? INK : TAUPE }}>
                        {name}
                      </span>
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: isSelected ? COPPER : "transparent",
                          border: isSelected ? "none" : `1px solid ${HAIRLINE}`,
                        }}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5" style={{ color: CREAM }} />}
                      </span>
                    </button>
                    {isSelected && (
                      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                        <button
                          type="button"
                          onClick={() => toggleMealType(name)}
                          className="rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
                          style={
                            isMeal
                              ? { background: COPPER, color: CREAM }
                              : { background: CANVAS, color: TAUPE, border: `1px solid ${HAIRLINE}` }
                          }
                        >
                          Meal / correction
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleMealType(name)}
                          className="rounded-full px-3 py-1.5 text-[11px] font-semibold transition"
                          style={
                            !isMeal
                              ? { background: INK, color: CREAM }
                              : { background: CANVAS, color: TAUPE, border: `1px solid ${HAIRLINE}` }
                          }
                        >
                          Background only
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </OnboardingShell>
  );
}