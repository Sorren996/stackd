// The quiet line the graph shows in place of a forecast the model withheld.
//
// The engine abstains only when the evidence is genuinely absent, and each of
// those reasons already means something in plain words. This turns the stored
// reason into one short editorial sentence — never a code, never a percentage —
// so the future area of the chart is never simply blank.

const FALLBACK_NOTE = "Not enough signal to project this right now";

export function abstainNoteFor(reason) {
  const text = String(reason || "").toLowerCase();
  if (!text) return FALLBACK_NOTE;
  if (text.includes("freshness") || text.includes("no valid")) return "Waiting for a fresh reading to project from";
  if (text.includes("sparse") || text.includes("insufficient")) return "Not enough recent readings to project yet";
  if (text.includes("gap")) return "A gap in the readings means no estimate right now";
  return FALLBACK_NOTE;
}