import { ExternalLink } from "lucide-react";
import Sheet from "@/components/Sheet";
import { describeProjectionReason, describeLocationAge } from "@/lib/sharing/sharingCopy";

const BBOX_SPAN = 0.004; // roughly 400 m each way — a small, local map

function mapSrc(latitude, longitude) {
  const minLon = longitude - BBOX_SPAN;
  const maxLon = longitude + BBOX_SPAN;
  const minLat = latitude - BBOX_SPAN;
  const maxLat = latitude + BBOX_SPAN;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

/**
 * The followed person's last known location.
 *
 * It is deliberately never called live or current: it is where they last shared
 * from, with the time that was recorded. No movement history, no tracking.
 */
export default function SharedLocationSheet({ open, onClose, location, reason, sharerLabel }) {
  if (!location) {
    return (
      <Sheet open={open} onClose={onClose}>
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <h2 className="pb-2 text-lg font-semibold" style={{ color: "#3f3830" }}>
            Last known location
          </h2>
          <p className="text-sm" style={{ color: "#746959" }}>
            {describeProjectionReason(reason)}
          </p>
        </div>
      </Sheet>
    );
  }

  const captured = location.captured_at ? new Date(location.captured_at) : null;
  const capturedLabel =
    captured && !Number.isNaN(captured.getTime())
      ? captured.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : null;

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <h2 className="pb-1 text-lg font-semibold" style={{ color: "#3f3830" }}>
          Last known location
        </h2>
        <p className="pb-4 text-sm" style={{ color: "#746959" }}>
          Where {sharerLabel} last shared from. This is not a live position and it is not updated continuously.
        </p>

        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "#eadccf" }}>
          <iframe
            title="Last known location"
            src={mapSrc(location.latitude, location.longitude)}
            className="h-44 w-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="space-y-1 pt-4">
          <p className="text-sm" style={{ color: "#3f3830" }}>
            {capturedLabel ? `Shared ${capturedLabel}` : "Shared at an unrecorded time"}
            {Number.isFinite(Number(location.age_minutes)) ? ` · ${describeLocationAge(location.age_minutes)}` : ""}
          </p>
          <p className="text-xs tabular-nums" style={{ color: "#746959" }}>
            {Number(location.latitude).toFixed(4)}, {Number(location.longitude).toFixed(4)}
            {Number.isFinite(Number(location.accuracy_m)) ? ` · within about ${Math.round(location.accuracy_m)} m` : ""}
          </p>
        </div>

        <a
          href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
          style={{ color: "#9c5228" }}
        >
          <ExternalLink className="h-4 w-4" />
          Open in maps
        </a>
      </div>
    </Sheet>
  );
}