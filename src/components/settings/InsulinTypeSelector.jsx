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
                ? "border-[#5fb490]/40 bg-[#5fb490]/10 text-white"
                : "border-white/10 bg-white/[0.02] text-white/45 hover:bg-white/[0.04]"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-md border ${
                  selected ? "border-[#5fb490] bg-[#5fb490]" : "border-white/20 bg-transparent"
                }`}
              >
                {selected && <Check className="h-3 w-3 text-[#0b1b1e]" />}
              </span>
              <span>
                <span className="block text-sm font-semibold">{name}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-50">{profile.category}</span>
              </span>
            </span>
            <Leaf className={`h-4 w-4 ${selected ? "text-[#5fb490]" : "text-white/15"}`} />
          </button>
        );
      })}
    </div>
  );
}