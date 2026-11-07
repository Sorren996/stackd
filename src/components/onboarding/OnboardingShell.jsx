import { ChevronLeft } from "lucide-react";
import {
  ONBOARDING_HEADER_PAD_TOP,
  ONBOARDING_FOOTER_PAD_BOTTOM,
  ONBOARDING_PAD_SIDE_LEFT,
  ONBOARDING_PAD_SIDE_RIGHT,
} from "@/lib/safeArea";

const CANVAS = "#f7f1e8";
const CREAM = "#fdf9f2";
const INK = "#3f3830";
const FAINT = "#746959";
const TAUPE = "#6b6153";
const HAIRLINE = "#eadccf";

/**
 * The one shell every onboarding step lives in.
 *
 * Why it exists: each step previously carried its own
 * `flex flex-col min-h-screen` root with a `flex-1 overflow-y-auto` body and no
 * height-constrained parent, so the PAGE scrolled instead of the body. The
 * header scrolled up under the clock, the title followed it, and nothing kept
 * the bottom action row clear of the home indicator.
 *
 * Scroll ownership is now explicit and there is only one owner:
 *   · the shell is pinned to the viewport (`fixed inset-0`), so the document
 *     itself never scrolls, bounces, or pans;
 *   · the header is opaque from y = 0 and reserves the status strip with its
 *     own padding — it cannot scroll away, so nothing is ever drawn beside the
 *     system icons;
 *   · the footer reserves the home-indicator strip the same way;
 *   · between them, ONE region scrolls (`min-h-0 flex-1 overflow-y-auto`), and
 *     the title scrolls inside it, so a tall title at large text sizes can
 *     never squeeze the body to nothing.
 *
 * The insets come from the shared resolver (lib/safeArea.js) and are applied
 * exactly once each: top and bottom by the header and footer, sides by the
 * shell. No step adds its own env() offset, and nothing here is a guessed
 * pixel height.
 */
export default function OnboardingShell({
  stepLabel,
  onBack,
  backLabel = "Back",
  title,
  intro,
  notice,
  footer,
  children,
}) {
  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{
        background: CANVAS,
        paddingLeft: ONBOARDING_PAD_SIDE_LEFT,
        paddingRight: ONBOARDING_PAD_SIDE_RIGHT,
      }}
    >
      {/* Header — opaque from the top edge, so the strip it reserves is painted
          by the header itself. */}
      <div
        className="shrink-0"
        style={{ background: CANVAS, paddingTop: ONBOARDING_HEADER_PAD_TOP }}
      >
        <div
          className="flex items-center gap-3 px-4 pb-3"
          style={{ borderBottom: `1px solid ${HAIRLINE}` }}
        >
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-[0.96]"
              style={{ background: CREAM, border: `1px solid ${HAIRLINE}` }}
            >
              <ChevronLeft className="h-4 w-4" style={{ color: INK }} />
            </button>
          ) : null}
          <p
            className="min-w-0 text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: FAINT }}
          >
            {stepLabel}
          </p>
        </div>
      </div>

      {/* The single scroll owner. The title belongs to it. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-4"
        style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain" }}
      >
        <div className="pt-6 pb-4">
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ color: INK, overflowWrap: "break-word" }}
          >
            {title}
          </h1>
          {intro ? (
            <p
              className="mt-2 text-sm leading-relaxed"
              style={{ color: TAUPE, overflowWrap: "break-word" }}
            >
              {intro}
            </p>
          ) : null}
        </div>

        {notice}

        {children}
      </div>

      {footer ? (
        <div
          className="shrink-0 space-y-2.5 px-5 py-3"
          style={{
            background: CANVAS,
            borderTop: `1px solid ${HAIRLINE}`,
            paddingBottom: ONBOARDING_FOOTER_PAD_BOTTOM,
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}