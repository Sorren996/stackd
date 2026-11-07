import { SAFE_TOP } from "@/lib/safeArea";

/**
 * Paints the OS status-bar strip for a shell that scrolls with the document
 * (the account screens and the MFA card page).
 *
 * Reserving the strip with padding is not enough on its own: the page still
 * scrolls, so a tall card passes through that region and its title ends up
 * drawn beside the clock. This is the second half of the contract in
 * lib/safeArea.js — a fixed, noninteractive strip in the shell's own colour
 * directly over the strip the padding reserves, so whatever scrolls beneath it
 * can never become visible around the system icons.
 *
 * It is aria-hidden and pointer-events:none: it is scenery, never a target. On
 * a phone without an inset (and on every desktop browser) its height resolves
 * to 0 and it paints nothing at all.
 */
export default function SafeAreaBand({ color = "var(--site-field)" }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: SAFE_TOP,
        background: color,
        zIndex: 45,
        pointerEvents: "none",
      }}
    />
  );
}