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
                ? "border-teal-500/40 bg-teal-500/10 text-white"
                : "border-white/10 bg-white/[0.03] text-white/45"
            }`}
          >
            <span>
              <span className="block text-sm font-semibold">{name}</span>
              <span className="text-[10px] uppercase tracking-wider opacity-50">{profile.category}</span>
            </span>
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: selected ? "#2dd4bf" : "rgba(255,255,255,0.12)" }}
            />
          </button>
        );
      })}
    </div>
  );
}