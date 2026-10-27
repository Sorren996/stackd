import { Droplet, Gauge, ListTree, Clock } from "lucide-react";
import PublicSection from "@/components/public/PublicSection";
import TodayPreview from "@/components/public/previews/TodayPreview";

const POINTS = [
  {
    icon: Droplet,
    title: "Your reading and its direction",
    body: "The current value with a trend arrow, drawn against the range you set. Unknown direction is shown as unknown, never as steady.",
  },
  {
    icon: Gauge,
    title: "Balance across the day",
    body: "How much of today sat in your range, above it or below it, so one hard hour does not look like the whole day.",
  },
  {
    icon: ListTree,
    title: "A timeline you can read",
    body: "Readings, doses, meals and notes in the order they happened, each labelled with what it is.",
  },
  {
    icon: Clock,
    title: "Honest about freshness",
    body: "When a reading is old, Stackd says how old it is. Anything estimated is labelled as an estimate.",
  },
];

export default function TodaySection() {
  return (
    <PublicSection
      id="today"
      tone="field"
      eyebrow="See today clearly"
      title="Start with what is happening now."
      lede="The dashboard answers the simplest question first: where are things right now, and how did the day get here."
    >
      <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16">
        <TodayPreview />
        <ul className="space-y-6">
          {POINTS.map((point) => (
            <li key={point.title} className="flex gap-4">
              <span
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(253, 249, 242, 0.14)" }}
                aria-hidden="true"
              >
                <point.icon className="h-5 w-5 text-field-ink" strokeWidth={1.8} />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-field-ink">{point.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-field-muted">{point.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PublicSection>
  );
}