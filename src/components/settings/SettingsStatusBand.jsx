import { Link } from "react-router-dom";

const CREAM = "#fdf9f2";
const HAIRLINE = "#eadccf";
const INK = "#2e2420";
const MUTED = "#6b6153";

const DOT = { ok: "#5b6550", attention: "#a0522d" };

/**
 * The Settings status band: full width, cream card, the one row on this page
 * allowed a status dot. Green while the sensor is healthy, rust the moment it
 * needs attention — and in that case the whole band becomes the fix, opening
 * the screen that resolves it.
 */
export default function SettingsStatusBand({ band }) {
  if (!band) return null;
  return (
    <Link
      to={band.to}
      className="block rounded-2xl border px-4 py-3.5 transition hover:opacity-80 active:opacity-60"
      style={{ background: CREAM, borderColor: HAIRLINE }}
      aria-label={`${band.title}. ${band.detail}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: DOT[band.tone] || DOT.ok }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: INK }}>
            {band.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: MUTED }}>
            {band.detail}
          </p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-sm" style={{ color: MUTED }}>
          ›
        </span>
      </div>
    </Link>
  );
}