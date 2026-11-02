import { ChevronDown } from "lucide-react";
import { MR } from "./mealReviewTheme";

/**
 * One readable meal row: the full logged name, its logged time and its carb
 * amount. With a selection handler it is the meal switcher for the shared
 * timeline (44px minimum tap target); without one it is a plain identity row
 * for a single-meal review.
 */
export default function MealRow({ name, time, carbs, selected = false, onSelect }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span
          className="block"
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.4,
            color: selected ? MR.rustDeep : MR.ink,
            overflowWrap: "anywhere",
          }}
        >
          {name}
        </span>
        <span className="mt-0.5 block tabular-nums" style={{ fontSize: 11.5, color: MR.sec }}>
          {time ? `${time} · ` : ""}
          {carbs} g carbs
        </span>
      </span>
      {onSelect && (
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: selected ? MR.rust : MR.sec,
            transform: selected ? "rotate(180deg)" : "none",
            transition: "transform 200ms",
          }}
        />
      )}
    </>
  );

  if (!onSelect) {
    return <div className="flex w-full items-center gap-3 px-5 py-3.5">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex min-h-[44px] w-full items-center gap-3 px-5 py-3.5 text-left"
      style={{ background: selected ? "rgba(160, 82, 45, 0.04)" : "transparent" }}
    >
      {body}
    </button>
  );
}