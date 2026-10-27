import { Droplet, Utensils, Syringe, NotebookPen } from "lucide-react";
import { Flag, PreviewCard, SampleTag, StatRow } from "@/components/public/parts";

const BALANCE = [
  { label: "In target range", percent: 72, color: "#5b6550" },
  { label: "Above", percent: 21, color: "#af751b" },
  { label: "Below", percent: 7, color: "#9c3f2e" },
];

const TIMELINE = [
  { icon: Droplet, title: "Glucose 118 mg/dL", meta: "2:14 PM · measured", tone: "Measured" },
  { icon: Syringe, title: "NovoLog 4 u", meta: "1:02 PM · logged for a meal", tone: "Logged by you" },
  { icon: Utensils, title: "Oats, yoghurt and berries", meta: "12:48 PM · 45 g carbs, 12 g protein, 9 g fat", tone: "Logged by you" },
  { icon: NotebookPen, title: "Felt steady through the afternoon", meta: "4:30 PM · journal note", tone: "Your note" },
];

/**
 * The day at a glance: the balance across the day, and the timeline that shows
 * what happened when, each entry labelled with what it is.
 */
export default function TodayPreview() {
  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <SampleTag />
      </div>

      <PreviewCard label="Today's balance">
        <div className="flex h-3 w-full overflow-hidden rounded-full" aria-hidden="true">
          {BALANCE.map((slice) => (
            <span key={slice.label} style={{ width: `${slice.percent}%`, background: slice.color }} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {BALANCE.map((slice) => (
            <div key={slice.label}>
              <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#6b6153" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: slice.color }} aria-hidden="true" />
                {slice.label}
              </span>
              <span className="mt-0.5 block text-sm font-bold tabular-nums" style={{ color: "#3f3830" }}>
                {slice.percent}%
              </span>
            </div>
          ))}
        </div>
        <StatRow label="Readings today" value="96" note="sensor and manual" />
        <p className="pt-2 text-[10px] leading-relaxed" style={{ color: "#746959" }}>
          If a reading is old, Stackd says so instead of presenting it as current.
        </p>
      </PreviewCard>

      <PreviewCard label="Timeline">
        <ul className="space-y-3">
          {TIMELINE.map((entry) => (
            <li key={entry.title} className="flex gap-3">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(107, 97, 83, 0.08)" }}
                aria-hidden="true"
              >
                <entry.icon className="h-4 w-4" style={{ color: "#6b6153" }} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold" style={{ color: "#3f3830" }}>
                  {entry.title}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "#746959" }}>
                  {entry.meta}
                </p>
              </div>
              <span className="ml-auto shrink-0 self-start">
                <Flag>{entry.tone}</Flag>
              </span>
            </li>
          ))}
        </ul>
      </PreviewCard>
    </div>
  );
}