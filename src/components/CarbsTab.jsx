import { useState, useMemo } from "react";
import { FOOD_DATABASE, FOOD_CATEGORIES } from "@/lib/carbAbsorption";
import { Switch } from "@/components/ui/switch";

const CARB_COLOR = "#d97706";

export default function CarbsTab({ onSubmit, isPending }) {
  const [carbFood, setCarbFood]           = useState(null);
  const [carbSearch, setCarbSearch]       = useState("");
  const [isCustom, setIsCustom]           = useState(false);
  const [customName, setCustomName]       = useState("");
  const [customCarbs, setCustomCarbs]     = useState(30);
  const [carbServings, setCarbServings]   = useState(1);
  const [carbTime, setCarbTime]           = useState(() => new Date().toTimeString().slice(0, 5));

  const nowTimeString = new Date().toTimeString().slice(0, 5);

  const filteredFoods = useMemo(() => {
    const q = carbSearch.toLowerCase();
    return FOOD_CATEGORIES.map((cat) => ({
      category: cat,
      items: FOOD_DATABASE.filter((f) => f.category === cat && (!q || f.name.toLowerCase().includes(q))),
    })).filter((g) => g.items.length > 0);
  }, [carbSearch]);

  const totalCarbs = isCustom
    ? customCarbs
    : carbFood ? Math.round(carbFood.carbs * carbServings * 10) / 10 : 0;

  const canSubmit = isCustom
    ? (customName.trim().length > 0 && customCarbs > 0)
    : !!carbFood;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const [h, m] = carbTime.split(":").map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    if (isCustom) {
      onSubmit({
        food_name: customName.trim(),
        is_custom: true,
        carbs: parseFloat(customCarbs),
        serving_amount: 1,
        consumed_at: dt.toISOString(),
      });
    } else {
      onSubmit({
        food_name: carbFood.name,
        is_custom: false,
        carbs: totalCarbs,
        serving_amount: carbServings,
        glycemic_index: carbFood.gi,
        absorption_profile: carbFood.profile,
        consumed_at: dt.toISOString(),
      });
    }
  };

  const adjustServings   = (d) => setCarbServings((v) => Math.max(0.5, Math.round((v + d) * 2) / 2));
  const adjustCustomCarbs = (d) => setCustomCarbs((v) => Math.max(1, v + d));

  return (
    <>
      <div className="overflow-y-auto h-[500px] px-5 pb-6 space-y-5">

        {/* Custom Food Toggle */}
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
          <div>
            <p className="text-sm text-white font-medium">Custom Food</p>
            <p className="text-xs text-white/40 mt-0.5">Manually enter carb amount</p>
          </div>
          <Switch
            checked={isCustom}
            onCheckedChange={(v) => { setIsCustom(v); setCarbFood(null); setCarbSearch(""); }}
          />
        </div>

        {isCustom ? (
          <>
            {/* Warning Banner */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
              <p className="text-xs text-amber-300/80 leading-relaxed">
                Custom foods do not have validated glycemic absorption data. They will appear as a plotted carbohydrate event rather than a predictive absorption curve.
              </p>
            </div>

            {/* Food Name */}
            <div>
              <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Food Name</p>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Homemade pasta..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-white/30 outline-none focus:border-amber-500/30 transition-colors"
              />
            </div>

            {/* Carbs Stepper */}
            <div>
              <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Total Carbs (g)</p>
              <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between mb-2">
                <button onClick={() => adjustCustomCarbs(-5)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">−</button>
                <div className="text-center">
                  <span className="text-4xl font-bold text-white">{customCarbs}</span>
                  <p className="text-white/40 text-sm mt-1">grams</p>
                </div>
                <button onClick={() => adjustCustomCarbs(5)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">+</button>
              </div>
              <div className="flex gap-2">
                {[15, 30, 45, 60, 80].map((v) => (
                  <button key={v} onClick={() => setCustomCarbs(v)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all border text-white"
                    style={{ borderColor: customCarbs === v ? "#d9770699" : "rgba(255,255,255,0.1)", backgroundColor: customCarbs === v ? "#d977062a" : "rgba(255,255,255,0.05)" }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Food Search */}
            <div>
              <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Food</p>
              <input
                type="text"
                value={carbSearch}
                onChange={(e) => setCarbSearch(e.target.value)}
                placeholder="Search foods..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-white/30 outline-none focus:border-amber-500/30 transition-colors mb-3"
              />

              <div className="space-y-3">
                {filteredFoods.map(({ category, items }) => (
                  <div key={category}>
                    <p className="text-xs text-white/30 uppercase tracking-wider mb-2">{category}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((food) => {
                        const isSelected = carbFood?.name === food.name;
                        return (
                          <button
                            key={food.name}
                            onClick={() => { setCarbFood(food); setCarbServings(1); }}
                            className="flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all"
                            style={{
                              borderColor: isSelected ? "#f59e0b99" : "rgba(255,255,255,0.1)",
                              backgroundColor: isSelected ? "rgba(245,158,11,0.15)" : "transparent",
                            }}
                          >
                            <span className="text-sm font-medium text-white">{food.name}</span>
                            <span className="text-xs text-white/40">{food.carbs}g · GI {food.gi}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Servings (only when food is selected) */}
            {carbFood && (
              <div>
                <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Servings</p>
                <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center justify-between mb-3">
                  <button onClick={() => adjustServings(-0.5)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">−</button>
                  <div className="text-center">
                    <span className="text-4xl font-bold text-white">{carbServings}</span>
                    <p className="text-white/40 text-sm mt-1">servings</p>
                  </div>
                  <button onClick={() => adjustServings(0.5)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors">+</button>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-white/60">Total Carbs</span>
                  <span className="text-xl font-bold text-amber-400">{totalCarbs}g</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Time */}
        <div>
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Time Consumed</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-white/40">Consumed at</span>
            <input
              type="time"
              value={carbTime}
              max={nowTimeString}
              onChange={(e) => { if (e.target.value <= nowTimeString) setCarbTime(e.target.value); }}
              className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer"
              style={{ colorScheme: "dark" }}
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="px-5 pb-6 pt-2 shrink-0">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
          className="w-full py-4 rounded-2xl disabled:opacity-40 text-white font-semibold text-base transition-all"
          style={{ backgroundColor: CARB_COLOR, filter: "brightness(0.85)" }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(0.85)"; }}
        >
          {isPending
            ? "Logging..."
            : canSubmit
              ? `Log ${totalCarbs}g ${isCustom ? (customName || "Custom Food") : carbFood.name}`
              : "Select a food"}
        </button>
      </div>
    </>
  );
}