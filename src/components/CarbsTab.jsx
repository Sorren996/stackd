import { useState, useMemo, useEffect } from "react";
import { FOOD_DATABASE, FOOD_CATEGORIES } from "@/lib/carbAbsorption";
import { base44 } from "@/api/base44Client";
import { X, Clock } from "lucide-react";

const CARB_COLOR = "#d97706";
const PROFILE_COLORS = { fast: "#ef4444", medium: "#f59e0b", slow: "#a78bfa" };

export default function CarbsTab({ onSubmit, isPending }) {
  const [carbSearch, setCarbSearch] = useState("");
  const [selectedFoods, setSelectedFoods] = useState([]); // [{ food, carbs }]
  const [recentFoods, setRecentFoods] = useState([]);
  const [carbTime, setCarbTime] = useState(() => new Date().toTimeString().slice(0, 5));

  const nowTimeString = new Date().toTimeString().slice(0, 5);

  // Load last 3 recently used foods from DB
  useEffect(() => {
    base44.entities.CarbEntry.list("-consumed_at", 20).then((entries) => {
      const seen = new Set();
      const recent = [];
      for (const e of entries) {
        if (!e.is_custom && !seen.has(e.food_name)) {
          seen.add(e.food_name);
          const food = FOOD_DATABASE.find((f) => f.name === e.food_name);
          if (food) recent.push(food);
        }
        if (recent.length >= 3) break;
      }
      setRecentFoods(recent);
    }).catch(() => {});
  }, []);

  const filteredFoods = useMemo(() => {
    const q = carbSearch.toLowerCase().trim();
    if (!q) return [];
    return FOOD_DATABASE.filter((f) => f.name.toLowerCase().includes(q));
  }, [carbSearch]);

  const addFood = (food) => {
    if (selectedFoods.find((s) => s.food.name === food.name)) return;
    setSelectedFoods((prev) => [...prev, { food, carbs: food.carbs }]);
    setCarbSearch("");
  };

  const removeFood = (name) => setSelectedFoods((prev) => prev.filter((s) => s.food.name !== name));

  const updateCarbs = (name, val) => {
    const n = parseFloat(val);
    setSelectedFoods((prev) =>
      prev.map((s) => s.food.name === name ? { ...s, carbs: isNaN(n) ? "" : n } : s)
    );
  };

  const totalCarbs = selectedFoods.reduce((sum, s) => sum + (parseFloat(s.carbs) || 0), 0);
  const canSubmit = selectedFoods.length > 0 && selectedFoods.every((s) => parseFloat(s.carbs) > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const [h, m] = carbTime.split(":").map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    const entries = selectedFoods.map((s) => ({
      food_name: s.food.name,
      is_custom: false,
      carbs: parseFloat(s.carbs),
      serving_amount: 1,
      glycemic_index: s.food.gi,
      absorption_profile: s.food.profile,
      consumed_at: dt.toISOString(),
    }));
    onSubmit(entries);
  };

  return (
    <>
      <div className="overflow-y-auto h-[500px] px-5 pb-6 space-y-5">

        {/* Search Bar */}
        <div className="relative">
          <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Search Foods</p>
          <input
            type="text"
            value={carbSearch}
            onChange={(e) => setCarbSearch(e.target.value)}
            placeholder="Search foods..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm placeholder:text-white/30 outline-none focus:border-amber-500/30 transition-colors"
          />

          {/* Search Results Dropdown */}
          {filteredFoods.length > 0 && (
            <div className="mt-2 bg-[hsl(162,10%,12%)] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              {filteredFoods.map((food) => {
                const already = !!selectedFoods.find((s) => s.food.name === food.name);
                return (
                  <button
                    key={food.name}
                    onClick={() => addFood(food)}
                    disabled={already}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0 disabled:opacity-40"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{food.name}</p>
                      <p className="text-xs text-white/40">{food.carbs}g · GI {food.gi}</p>
                    </div>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: PROFILE_COLORS[food.profile] + "22", color: PROFILE_COLORS[food.profile] }}
                    >
                      {food.profile}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recently Used */}
        {recentFoods.length > 0 && carbSearch === "" && (
          <div>
            <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3 flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Recently Used
            </p>
            <div className="flex flex-wrap gap-2">
              {recentFoods.map((food) => {
                const already = !!selectedFoods.find((s) => s.food.name === food.name);
                return (
                  <button
                    key={food.name}
                    onClick={() => addFood(food)}
                    disabled={already}
                    className="flex flex-col items-start px-3 py-2 rounded-xl border transition-all text-left disabled:opacity-40"
                    style={{
                      borderColor: already ? PROFILE_COLORS[food.profile] + "99" : "rgba(255,255,255,0.1)",
                      backgroundColor: already ? PROFILE_COLORS[food.profile] + "22" : "transparent",
                    }}
                  >
                    <span className="text-sm font-medium text-white">{food.name}</span>
                    <span className="text-xs text-white/40">{food.carbs}g · {food.profile}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected Foods */}
        {selectedFoods.length > 0 && (
          <div>
            <p className="text-sm font-bold tracking-widest text-white/40 uppercase mb-3">Selected Foods</p>
            <div className="space-y-2">
              {selectedFoods.map(({ food, carbs }) => (
                <div
                  key={food.name}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{food.name}</p>
                    <p className="text-xs text-white/40">GI {food.gi} ·{" "}
                      <span style={{ color: PROFILE_COLORS[food.profile] }}>{food.profile}</span>
                    </p>
                  </div>
                  {/* Carbs Input */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={carbs}
                      onChange={(e) => updateCarbs(food.name, e.target.value)}
                      className="w-16 text-center bg-black/20 border border-white/10 rounded-xl px-2 py-1.5 text-white text-sm font-bold outline-none focus:border-amber-500/40 transition-colors"
                    />
                    <span className="text-xs text-white/40">g</span>
                  </div>
                  <button
                    onClick={() => removeFood(food.name)}
                    className="text-white/30 hover:text-white/70 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Total */}
              {selectedFoods.length > 1 && (
                <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-2.5">
                  <span className="text-sm text-white/60">Total Carbs</span>
                  <span className="text-lg font-bold text-amber-400">{Math.round(totalCarbs * 10) / 10}g</span>
                </div>
              )}
            </div>
          </div>
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
              ? `Log ${Math.round(totalCarbs * 10) / 10}g across ${selectedFoods.length} food${selectedFoods.length > 1 ? "s" : ""}`
              : "Select a food to log"}
        </button>
      </div>
    </>
  );
}