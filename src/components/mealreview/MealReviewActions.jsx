import { MR } from "./mealReviewTheme";

// 6.8:1 on the cream card — the pale theme sage is a fill, never text.
const SAGE_INK = "#4D5742";

/**
 * The review's two quiet actions, at the foot of the same card.
 *
 * "Mark as resolved" settles the review as reviewed; "Not now" is a text link so
 * it can never be mistaken for the primary action, and it is recorded as
 * dismissed — never as reviewed. Both write to the meal's own record, which is
 * what the reminder worker reads on the server.
 */
export default function MealReviewActions({ settled, busy, onResolve, onNotNow }) {
  if (settled || !onResolve || !onNotNow) return null;
  return (
    <div className="px-5 pb-5 pt-1">
      <div className="border-t pt-3.5" style={{ borderColor: MR.hairline }}>
        <button
          type="button"
          onClick={onResolve}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-semibold transition disabled:opacity-50"
          style={{ borderColor: `${SAGE_INK}40`, background: `${SAGE_INK}12`, color: SAGE_INK }}
        >
          Mark as resolved
        </button>
        <button
          type="button"
          onClick={onNotNow}
          disabled={busy}
          className="mt-1 block w-full py-2 text-[12px] underline-offset-2 transition hover:underline disabled:opacity-50"
          style={{ color: MR.sec }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}