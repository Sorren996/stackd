// One observational line under the Current Glucose reading.
//
// Urgent low gets a direct, serious attention line; a below-zone reading gets a
// single calm observation. It describes the moment only — it never proposes
// treatment, and the user's care plan decides what happens next.
export default function CurrentGlucoseNote({ note, tone }) {
  if (!note) return null;
  const urgent = tone === "urgentLow";

  return (
    <p
      className={`mt-2 px-1 text-sm leading-relaxed${urgent ? " font-medium" : ""}`}
      style={{ color: urgent ? "#3f3830" : "#6b6153" }}
    >
      {note}
    </p>
  );
}