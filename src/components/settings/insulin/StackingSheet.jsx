import { useState } from "react";
import { Switch } from "@/components/ui/switch";

/**
 * Stacking warnings edit sheet — simple toggle. Cancel/Save footer.
 */
export default function StackingSheet({ value, onSave, onCancel }) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="px-6 pt-2 text-center">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>
          Stacking warnings
        </h2>
      </div>

      <div className="flex items-center justify-between px-6 pt-6">
        <div className="pr-4">
          <p className="text-base" style={{ color: "#3f3830" }}>
            Alert when multiple rapid doses overlap
          </p>
          <p className="mt-1 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
            A gentle heads-up if a new dose may stack with insulin already on board.
          </p>
        </div>
        <Switch checked={draft} onCheckedChange={setDraft} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 px-6 pb-[max(env(safe-area-inset-bottom),1rem)] pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="py-3.5 text-sm font-medium transition active:opacity-60"
          style={{ color: "#9c5228" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="rounded-full px-8 py-3.5 text-sm font-semibold transition active:scale-[0.98]"
          style={{ background: "#9c5228", color: "#fdf9f2", boxShadow: "0 4px 16px rgba(156,82,40,0.28)" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}