import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";
import { reportShellInsetsOnce } from "@/lib/safeArea";

/**
 * One shell for every public page, so the site reads as a single experience:
 * a muted slate-blue field, warm cream reading surfaces, and the same compact
 * navigation and footer throughout. Motion is reduced for anyone who asks for
 * that at the system level.
 *
 * Safe area is owned inside the shell, not here: PublicNav reserves and paints
 * the top strip (it is sticky, so it covers the strip at every scroll position),
 * and PublicFooter reserves and paints the home-indicator strip. The page itself
 * scrolls in normal document flow, which keeps iOS keyboard behaviour native.
 * See lib/safeArea.js for the whole contract.
 */
export default function PublicShell({ children }) {
  // One code-only line per launch, so a wrapper that reports no inset is
  // identifiable from the device itself.
  useEffect(() => {
    reportShellInsetsOnce();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div id="top" className="min-h-screen bg-field text-field-ink">
        <a
          href="#main"
          className="skip-link sr-only focus:not-sr-only focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
        >
          Skip to content
        </a>
        <PublicNav />
        <main id="main">{children}</main>
        <PublicFooter />
      </div>
    </MotionConfig>
  );
}