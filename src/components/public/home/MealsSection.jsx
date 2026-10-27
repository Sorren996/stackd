import { Link } from "react-router-dom";
import PublicSection from "@/components/public/PublicSection";
import MealInsulinPreview from "@/components/public/previews/MealInsulinPreview";

const POINTS = [
  {
    title: "Insulin you actually logged",
    body: "Add doses from your own insulin library, mark whether a dose was for a meal or a correction, and see how much rapid-acting activity is likely still working.",
  },
  {
    title: "Basal kept separate",
    body: "Long-acting insulin is recorded as a background level on its own line. It is never folded into your active rapid-acting estimate.",
  },
  {
    title: "Meals in context",
    body: "Log carbohydrates, protein and fat, mark rescue carbs so they stay out of meal estimates, and note how a meal tended to absorb.",
  },
  {
    title: "Optional estimates you review",
    body: "Describe a meal or add a photo and Stackd can suggest the numbers. Every value is yours to change, and nothing is logged until you review it.",
  },
];

export default function MealsSection() {
  return (
    <PublicSection
      tone="paper"
      eyebrow="Meals and insulin in context"
      title="The parts that explain the curve."
      lede="A reading tells you what happened. Meals, doses and timing help explain why, and Stackd keeps them next to the curve instead of in another app."
    >
      <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div className="order-2 lg:order-1">
          <ul className="space-y-5">
            {POINTS.map((point) => (
              <li key={point.title} style={{ borderTop: "1px solid #eadccf" }} className="pt-5 first:border-t-0 first:pt-0">
                <h3 className="text-[15px] font-semibold text-ink">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{point.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm leading-relaxed text-ink-muted">
            Estimates describe what you logged using the settings you confirmed with your care team. Stackd does not
            decide doses and does not approve treatment.{" "}
            <Link to="/how-it-works" className="font-semibold underline decoration-[#9c5228]/40 underline-offset-4" style={{ color: "#8a4a24" }}>
              See how a day works
            </Link>
            .
          </p>
        </div>
        <div className="order-1 lg:order-2">
          <MealInsulinPreview />
        </div>
      </div>
    </PublicSection>
  );
}