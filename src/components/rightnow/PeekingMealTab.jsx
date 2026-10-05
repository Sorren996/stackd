// Peeking tab beneath the active meal card.
// A cream card peeking out below with slight rotation (~1.2deg) and warm
// shadow. Shows a sage dot, bold "Name · TIME", subtext "Ng · Nu · beneath
// this card", and a copper up-arrow. Tapping it brings that meal to the top.

const SAGE = "#5b6550";
const COPPER = "#9c5228";
const INK = "#3f3830";
const FAINT = "#746959";
const CREAM = "#fdf9f2";

function formatClock(time) {
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtUnits(u) {
  const n = Number(u);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function PeekingMealTab({ name, mealTime, carbs, units, onClick, rotation = 1.2 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full overflow-hidden rounded-[20px] px-4 py-3 text-left transition-transform active:scale-[0.99]"
      style={{
        background: CREAM,
        boxShadow: "0 6px 20px rgba(63,56,48,0.10)",
        transform: `rotate(${rotation}deg)`,
        marginTop: -8,
      }}
      aria-label={`Bring ${name} to the top`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: SAGE }} />
          <span className="min-w-0 truncate text-[13px] font-bold" style={{ color: INK }}>
            {name}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: FAINT }}>
            {formatClock(mealTime)}
          </span>
        </div>
        <span className="shrink-0 text-[16px] font-semibold" style={{ color: COPPER }}>
          ↑
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px]" style={{ color: FAINT }}>
        {Math.round(carbs)}g · {fmtUnits(units)}u · beneath this card
      </p>
    </button>
  );
}