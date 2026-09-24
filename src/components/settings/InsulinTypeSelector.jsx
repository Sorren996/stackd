import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Leaf, Check } from "lucide-react";

export default function InsulinTypeSelector({ selectedTypes, onToggle, categories }) {
  const entries = Object.entries(INSULIN_PROFILES).filter(
    ([, profile]) => !categories || categories.includes(profile.category)
  );
  return (
    <div className="grid grid-cols-1 gap-2">
      {entries.map(([name, profile]) => {
        const selected = selectedTypes.includes(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition ${
              selected
                ? "border-[#5b6550]/40 bg-[#5b6550]/10"
                : "border-[#eadccf] bg-[#f7f1e8] hover:bg-[#f0e8db]"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-md border ${
                  selected ? "border-[#5b6550] bg-[#5b6550]" : "border-[#b8aea0] bg-transparent"
                }`}
              >
                {selected && <Check className="h-3 w-3 text-[#f7f1e8]" />}
              </span>
              <span>
                <span className="block text-sm font-semibold" style={{ color: selected ? "#3f3830" : "#6b6153" }}>{name}</span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "#746959" }}>{profile.category}</span>
              </span>
            </span>
            <Leaf className="h-4 w-4" style={{ color: selected ? "#5b6550" : "#b8aea0" }} />
          </button>
        );
      })}
    </div>
  );
}