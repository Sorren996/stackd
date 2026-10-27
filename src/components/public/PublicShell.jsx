import { MotionConfig } from "framer-motion";
import PublicNav from "@/components/public/PublicNav";
import PublicFooter from "@/components/public/PublicFooter";

/**
 * One shell for every public page, so the site reads as a single experience:
 * a muted slate-blue field, warm cream reading surfaces, and the same compact
 * navigation and footer throughout. Motion is reduced for anyone who asks for
 * that at the system level.
 */
export default function PublicShell({ children }) {
  return (
    <MotionConfig reducedMotion="user">
      <div id="top" className="min-h-screen bg-field text-field-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
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