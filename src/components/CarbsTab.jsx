import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  FOOD_CATEGORIES,
  FOOD_DATABASE,
} from "@/lib/carbAbsorption";

export default function CarbsTab({ onSubmit, isPending }) {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedFoods, setSelectedFoods] = useState([]);

  const filteredFoods = useMemo(() => {
    const search = query.trim().toLowerCase();

    return FOOD_DATABASE.filter((food) => {
      const matchesCategory =
        selectedCategory === "All" || food.category === selectedCategory;
      const matchesSearch =
        !search || food.name.toLowerCase().includes(search);

      return matchesCategory && matchesSearch;
    });
  }, [query, selectedCategory]);

  const addFood = (food) => {
    setSelectedFoods((foods) => [
      ...foods,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: food.name,
        carbs: food.carbs,
        gi: food.gi,
        category: food.category,
        profile: food.profile,
        absorption_profile: food.profile,
      },
    ]);
  };

  const updateFood = (id, patch) => {
    setSelectedFoods((foods) =>
      foods.map((food) => (food.id === id ? { ...food, ...patch } : food))
    );
  };

  const removeFood = (id) => {
    setSelectedFoods((foods) => foods.filter((food) => food.id !== id));
  };

  const handleSubmit = () => {
    if (!selectedFoods.length) return;

    const consumedAt = new Date().toISOString();
    const entries = selectedFoods.map(({ id, profile, ...food }) => ({
      ...food,
      carbs: Number(food.carbs) || 0,
      gi: Number(food.gi) || 50,
      consumed_at: consumedAt,
      is_custom: false,
    }));

    onSubmit(entries);
  };

  const totalCarbs = selectedFoods.reduce(
    (sum, food) => sum + (Number(food.carbs) || 0),
    0
  );

  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-4">
      <div className="space-y-3">
        <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">
          Preset foods
        </p>

        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
          <Search className="h-4 w-4 text-white/35" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search foods"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {["All", ...FOOD_CATEGORIES].map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                selectedCategory === category
                  ? "border-teal-400/50 bg-teal-400/15 text-teal-200"
                  : "border-white/10 bg-white/5 text-white/45"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
        {filteredFoods.slice(0, 80).map((food) => (
          <button
            key={`${food.name}-${food.category}`}
            type="button"
            onClick={() => addFood(food)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-teal-400/40 hover:bg-teal-400/5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">
                {food.name}
              </p>
              <p className="text-xs text-white/35">
                {food.carbs}g carbs · GI {food.gi}
              </p>
            </div>
            <Plus className="h-4 w-4 shrink-0 text-white/40" />
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">
          Selected
        </p>

        {selectedFoods.length ? (
          <div className="space-y-2">
            {selectedFoods.map((food) => (
              <div
                key={food.id}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm font-semibold text-white">
                    {food.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeFood(food.id)}
                    className="text-xs text-white/35 transition hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                      Carbs
                    </span>
                    <input
                      type="number"
                      min="0"
                      inputMode="decimal"
                      value={food.carbs}
                      onChange={(event) =>
                        updateFood(food.id, { carbs: event.target.value })
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-teal-400"
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                      GI
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      inputMode="decimal"
                      value={food.gi}
                      onChange={(event) =>
                        updateFood(food.id, { gi: event.target.value })
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-teal-400"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/35">
            Choose a food above to log carbs.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selectedFoods.length || isPending}
        className="mt-5 w-full rounded-2xl bg-orange-600 py-4 text-base font-semibold text-white transition hover:bg-orange-500 disabled:opacity-40"
      >
        {isPending
          ? "Logging..."
          : selectedFoods.length
            ? `Log ${Math.round(totalCarbs)}g carbs`
            : "Select food"}
      </button>
    </div>
  );
}
