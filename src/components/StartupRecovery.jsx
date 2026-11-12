import { Loader2 } from "lucide-react";
import SplashMark from "@/components/startup/SplashMark";

/**
 * The calm bounded launch state. Shown when a startup step did not answer
 * inside its deadline, or answered with something other than a session — never
 * as a spinner nobody can leave.
 *
 * Retry is explicit and manual (no automatic reload loops). Sign-in is offered
 * only where it is a safe next step.
 */
export default function StartupRecovery({
  title = "We could not reach Stackd just now",
  message = "Your data is safe. Check your connection, then try again.",
  onRetry,
  retrying = false,
  showSignIn = false,
  onSignIn,
}) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-field px-6"
    >
      <SplashMark />

      <div className="mt-10 w-full max-w-xs bg-paper text-center shadow-[0_0_0_24px_var(--site-surface)]">
        <h1 className="text-base font-semibold" style={{ color: "#3f3830" }}>
          {title}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "#6b6153" }}>
          {message}
        </p>

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition disabled:opacity-70"
            style={{ background: "#3f3830", color: "#fdf9f2" }}
          >
            {retrying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {retrying ? "Trying again" : "Try again"}
          </button>
        )}

        {showSignIn && (
          <button
            type="button"
            onClick={onSignIn}
            className="mt-3 w-full rounded-2xl border py-3.5 text-sm font-medium transition"
            style={{ borderColor: "#eadccf", background: "#fdf9f2", color: "#6b6153" }}
          >
            Sign in again
          </button>
        )}
      </div>
    </div>
  );
}