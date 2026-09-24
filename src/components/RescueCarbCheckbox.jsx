const RESCUE_COLOR = "#a78bfa";
const INK = "#3f3830";
const TAUPE = "#6b6153";
const HAIRLINE = "#eadccf";

export const RESCUE_CARB_COLOR = RESCUE_COLOR;

export default function RescueCarbCheckbox({ checked, onChange }) {
  return (
    <div
      className="rounded-2xl border p-4 transition-colors"
      style={{
        borderColor: checked ? `${RESCUE_COLOR}66` : HAIRLINE,
        background: checked ? `${RESCUE_COLOR}0d` : "transparent",
      }}
    >
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="rescue-carb"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 shrink-0 cursor-pointer rounded"
          style={{ accentColor: RESCUE_COLOR }}
          aria-label="Rescue carb"
        />
        <label
          htmlFor="rescue-carb"
          className="cursor-pointer text-sm font-medium transition-colors"
          style={{ color: INK }}
        >
          Rescue carb
        </label>
      </div>
      {checked && (
        <p className="mt-2 pl-7 text-[11px] leading-relaxed" style={{ color: TAUPE }}>
          Treats or prevents a low. Not included in insulin calculations.
        </p>
      )}
    </div>
  );
}