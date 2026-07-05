import { useState } from "react";
import { Info } from "lucide-react";
import HighProteinFatInfoModal from "@/components/HighProteinFatInfoModal";

export default function HighProteinFatCheckbox({ checked, onChange }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <HighProteinFatInfoModal open={showInfo} onClose={() => setShowInfo(false)} />
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="high-protein-fat-meal"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-white/30 bg-white/10 accent-teal-500"
            aria-label="High protein or high fat meal"
          />
          <label
            htmlFor="high-protein-fat-meal"
            className="cursor-pointer text-sm font-medium text-white/75"
          >
            High protein or high fat meal
          </label>
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="shrink-0 text-white/30 transition-colors hover:text-white/60"
            aria-label="Learn about high protein and high fat meal monitoring"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-2 pl-7 text-[11px] leading-relaxed text-white/35">
          Select this when a meal contains a substantial amount of protein, fat,
          or both and may affect glucose later than expected.
        </p>
      </div>
    </>
  );
}