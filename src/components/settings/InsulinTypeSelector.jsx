import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";

export default function InsulinTypeSelector({ selectedTypes, onToggle }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {Object.entries(INSULIN_PROFILES).map(([name, profile]) => {
        const selected = selectedTypes.includes(name);
        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-left transition ${
              selected
                ? "border-teal-500/50 bg-teal-500/15 text-emerald-950"
                : "border-white/45 bg-white/25 text-emerald-900/70"
            }`}
          >
            <span>
              <span className="block text-sm font-semibold">{name}</span>
              <span className="text-[10px] uppercase tracking-wider text-emerald-800/70">{profile.category}</span>
            </span>
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: selected ? "#0d9488" : "rgba(8,14,11,0.2)" }}
            />
          </button>
        );
      })}
    </div>
  );
}