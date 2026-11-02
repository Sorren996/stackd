import { MR } from "./mealReviewTheme";

/**
 * One line of the card's ledger: a name on the left, a dotted leader running
 * to a right-aligned figure. This is the section's only row grammar — it
 * replaces the progress bars and chips so the numbers read like a statement
 * someone wrote out, not a dashboard readout.
 */
export default function LedgerLine({ label, value, strong = false, tone }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="min-w-0"
        style={{
          fontSize: strong ? 13 : 12.5,
          fontWeight: strong ? 600 : 400,
          lineHeight: 1.5,
          color: strong ? MR.ink : MR.sec,
        }}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className="min-w-[16px] flex-1"
        style={{ borderBottom: `1px dotted ${MR.dotted}`, marginBottom: 4 }}
      />
      <span
        className="shrink-0 tabular-nums"
        style={{
          fontSize: strong ? 14 : 13,
          fontWeight: strong ? 600 : 500,
          color: tone || (strong ? MR.ink : MR.sec),
        }}
      >
        {value}
      </span>
    </div>
  );
}