import { useEffect, useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";
import Sheet from "@/components/Sheet";
import { describeProjectionReason, describeLocationAge } from "@/lib/sharing/sharingCopy";

const INK = "#3f3830";
const MUTED = "#746959";
const ACCENT = "#4C6770";
const HAIRLINE = "#eadccf";
const BBOX_SPAN = 0.004; // roughly 400 m each way — a small, local map
const MAP_HEIGHT = 200;
// The frame is created only once the sheet has settled: a frame built while the
// sheet is still sliding (inside a transformed, off-screen container) can stay
// blank on iOS Safari, and a container that is still animating has no final
// size to give it.
const MAP_SETTLE_MS = 400;
// Bounded: a map that never loads must never leave an unexplained blank area.
const MAP_TIMEOUT_MS = 8000;

/** Coordinates that are actually usable. 0 is a real position, not a missing value. */
function isUsableCoordinate(value, limit) {
  const n = Number(value);
  return Number.isFinite(n) && n >= -limit && n <= limit;
}

function hasUsableCoordinates(location) {
  return (
    Boolean(location) &&
    isUsableCoordinate(location.latitude, 90) &&
    isUsableCoordinate(location.longitude, 180)
  );
}

function mapSrc(latitude, longitude) {
  const minLon = longitude - BBOX_SPAN;
  const maxLon = longitude + BBOX_SPAN;
  const minLat = latitude - BBOX_SPAN;
  const maxLat = latitude + BBOX_SPAN;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

/**
 * The map itself, with an honest state at every step: settling, loading, drawn,
 * or unable to load — in which case the exact position is still shown and can
 * still be opened elsewhere. There is never a blank area with no explanation.
 */
function LocationMap({ latitude, longitude }) {
  const [phase, setPhase] = useState("settling");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setPhase("settling");
    const settle = setTimeout(() => setPhase("loading"), MAP_SETTLE_MS);
    return () => clearTimeout(settle);
  }, [attempt]);

  useEffect(() => {
    if (phase !== "loading") return;
    const timeout = setTimeout(() => {
      setPhase((current) => (current === "loading" ? "failed" : current));
    }, MAP_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [phase]);

  // A frame refused by a content-security policy still fires its load event and
  // paints nothing, so the browser's own violation report is the only reliable
  // signal that the map was blocked. Treated as a failure, never as a drawn map.
  useEffect(() => {
    const onViolation = (event) => {
      if (String(event?.violatedDirective || "").includes("frame-src")) {
        setPhase("failed");
      }
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    return () => document.removeEventListener("securitypolicyviolation", onViolation);
  }, []);

  const showFrame = phase === "loading" || phase === "ready";

  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{ borderColor: HAIRLINE, height: MAP_HEIGHT, background: "#fdf9f2" }}
    >
      {showFrame && (
        <iframe
          key={attempt}
          title="Map of the last shared position"
          src={mapSrc(latitude, longitude)}
          style={{ display: "block", width: "100%", height: MAP_HEIGHT, border: 0 }}
          onLoad={() => setPhase((current) => (current === "loading" ? "ready" : current))}
          onError={() => setPhase("failed")}
          referrerPolicy="no-referrer"
        />
      )}

      {phase !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          {phase === "failed" ? (
            <>
              <p className="text-xs" style={{ color: INK }}>
                The map could not load on this device.
              </p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: "rgba(76,103,112,0.12)", color: ACCENT }}
              >
                <RotateCw className="h-3.5 w-3.5" />
                Try again
              </button>
              <p className="text-[11px]" style={{ color: MUTED }}>
                The exact position below is unaffected.
              </p>
            </>
          ) : (
            <>
              <div className="h-1.5 w-24 animate-pulse rounded-full" style={{ background: "rgba(116,105,89,0.20)" }} />
              <p className="text-xs" style={{ color: MUTED }}>
                Loading map…
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The followed person's last known location.
 *
 * It is deliberately never called live or current: it is where they last shared
 * from, with the time that position was actually observed. No movement history
 * and no tracking. That time is shown as the position's own — a glucose reading
 * arriving does not make it newer.
 */
export default function SharedLocationSheet({ open, onClose, location, reason, sharerLabel }) {
  if (!location) {
    return (
      <Sheet open={open} onClose={onClose}>
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <h2 className="pb-2 text-lg font-semibold" style={{ color: INK }}>
            Last known location
          </h2>
          <p className="text-sm" style={{ color: MUTED }}>
            {describeProjectionReason(reason)}
          </p>
        </div>
      </Sheet>
    );
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const usable = hasUsableCoordinates(location);
  const captured = location.captured_at ? new Date(location.captured_at) : null;
  const observedLabel =
    captured && !Number.isNaN(captured.getTime())
      ? captured.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <h2 className="pb-1 text-lg font-semibold" style={{ color: INK }}>
          Last known location
        </h2>
        <p className="pb-4 text-sm" style={{ color: MUTED }}>
          Where {sharerLabel} last shared from. Not a live position, and not updated continuously.
        </p>

        {usable ? (
          <LocationMap latitude={latitude} longitude={longitude} />
        ) : (
          <div
            className="flex flex-col items-center justify-center rounded-2xl border px-6 text-center"
            style={{ borderColor: HAIRLINE, height: MAP_HEIGHT }}
          >
            <p className="text-xs" style={{ color: INK }}>
              This position cannot be placed on a map.
            </p>
            <p className="pt-1 text-[11px]" style={{ color: MUTED }}>
              The saved coordinates are not in a usable range.
            </p>
          </div>
        )}

        <div className="space-y-1 pt-4">
          <p className="text-sm" style={{ color: INK }}>
            {observedLabel ? `Position observed ${observedLabel}` : "Position observed at an unrecorded time"}
          </p>
          {Number.isFinite(Number(location.age_minutes)) && (
            <p className="text-xs" style={{ color: MUTED }}>
              {describeLocationAge(location.age_minutes)}
            </p>
          )}
          {usable && (
            <p className="text-xs tabular-nums" style={{ color: MUTED }}>
              {latitude.toFixed(4)}, {longitude.toFixed(4)}
              {Number.isFinite(Number(location.accuracy_m))
                ? ` · within about ${Math.round(Number(location.accuracy_m))} m`
                : ""}
            </p>
          )}
          <p className="pt-1 text-[11px]" style={{ color: MUTED }}>
            This is the position&apos;s own time. New glucose readings do not update it.
          </p>
        </div>

        {usable && (
          <a
            href={`https://www.google.com/maps?q=${latitude},${longitude}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
            style={{ color: "#9c5228" }}
          >
            <ExternalLink className="h-4 w-4" />
            Open in maps
          </a>
        )}
      </div>
    </Sheet>
  );
}