import { Flag, PreviewCard, SampleTag, StatRow } from "@/components/public/parts";

const WEEK = [
  { day: "M", state: "on" },
  { day: "T", state: "on" },
  { day: "W", state: "on" },
  { day: "T", state: "on" },
  { day: "F", state: "today" },
  { day: "S", state: "quiet" },
  { day: "S", state: "quiet" },
];

/**
 * The longer view: a day you can open in detail, and the range views for the
 * window you choose. Only the views that exist in the app today are shown.
 */
export default function HistoryPreview() {
  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <SampleTag />
      </div>

      <PreviewCard label="Journal">
        <div className="flex items-center justify-between gap-2" aria-hidden="true">
          {WEEK.map((day, i) => (
            <span key={`${day.day}-${i}`} className="flex flex-col items-center gap-1.5">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold"
                style={
                  day.state === "today"
                    ? { background: "#9c5228", color: "#fdf9f2" }
                    : day.state === "on"
                      ? { background: "rgba(91, 101, 80, 0.14)", color: "#4d5742" }
                      : { background: "rgba(107, 97, 83, 0.08)", color: "#746959" }
                }
              >
                {day.day}
              </span>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: day.state === "quiet" ? "transparent" : "#9c5228" }} />
            </span>
          ))}
        </div>
        <StatRow label="Entries today" value="7" note="glucose, insulin, meals, notes" />
        <StatRow label="Average reading" value="126 mg/dL" />
        <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
          Open any day to see it in full: readings, doses, meals and the notes you wrote at the time.
        </p>
      </PreviewCard>

      <PreviewCard label="Range view" right={<Flag>Last 90 days</Flag>}>
        <StatRow label="Average glucose" value="131 mg/dL" />
        <StatRow label="Time in range" value="71%" />
        <StatRow label="Time above range" value="23%" />
        <StatRow label="Time below range" value="6%" />
        <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
          Ranges describe your own logged data over the window you pick. They are a picture of what happened, not a
          target to hit.
        </p>
      </PreviewCard>
    </div>
  );
}