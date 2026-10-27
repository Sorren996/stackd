import { Link } from "react-router-dom";
import { ArrowRight, Bluetooth, PenLine, Smartphone } from "lucide-react";
import PublicSection from "@/components/public/PublicSection";

const PATHS = [
  {
    icon: Bluetooth,
    title: "Connect a supported Dexcom Share account",
    body: "Stackd signs in to your Dexcom Share account with your own credentials, stored encrypted, and reads new sensor values for you. You can disconnect at any time from Settings.",
  },
  {
    icon: PenLine,
    title: "Or enter readings by hand",
    body: "Manual glucose logging is on by default and can be turned off if a sensor already covers you. Both paths lead to the same dashboard.",
  },
];

export default function StartSection() {
  return (
    <PublicSection
      id="start"
      tone="field"
      eyebrow="Start your way"
      title="Bring your own data, or start from now."
      lede="There is no wrong way in. Connect a sensor if you have one, or begin with what you already know."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {PATHS.map((path) => (
          <div
            key={path.title}
            className="rounded-3xl p-6"
            style={{ background: "rgba(253, 249, 242, 0.06)", border: "1px solid rgba(253, 249, 242, 0.22)" }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: "rgba(253, 249, 242, 0.16)" }}
              aria-hidden="true"
            >
              <path.icon className="h-5 w-5 text-field-ink" strokeWidth={1.8} />
            </span>
            <h3 className="mt-4 text-base font-semibold text-field-ink">{path.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-field-ink">{path.body}</p>
          </div>
        ))}
      </div>

      <div
        className="mt-10 flex flex-col gap-5 rounded-3xl bg-paper p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7"
        style={{ border: "1px solid #eadccf" }}
      >
        <div className="flex gap-4">
          <span
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(76, 103, 112, 0.10)" }}
            aria-hidden="true"
          >
            <Smartphone className="h-5 w-5" style={{ color: "#3f5760" }} strokeWidth={1.8} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-ink">Add Stackd to your home screen</h3>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
              No app store needed. It opens like an app, and instructions for iPhone, iPad, Android and desktop are one
              page away.
            </p>
          </div>
        </div>
        <Link
          to="/install"
          className="inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition-transform hover:opacity-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9c5228] focus-visible:ring-offset-2"
          style={{ background: "#9c5228", color: "#fdf9f2" }}
        >
          Install Stackd
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </PublicSection>
  );
}