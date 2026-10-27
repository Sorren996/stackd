import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import PublicShell from "@/components/public/PublicShell";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicSection from "@/components/public/PublicSection";
import GlucosePreview from "@/components/public/previews/GlucosePreview";
import MealInsulinPreview from "@/components/public/previews/MealInsulinPreview";
import HistoryPreview from "@/components/public/previews/HistoryPreview";
import useSiteMeta from "@/hooks/useSiteMeta";

const LOG_STEPS = [
  {
    title: "Glucose, if you enter it yourself",
    body: "Manual readings can be logged from the log button on the dashboard, and switched off entirely in Settings when a sensor already covers you.",
  },
  {
    title: "Insulin, from your own library",
    body: "Stackd only offers the insulin types you added. Each dose records the type, the amount and the time, and you can mark whether it was for a meal or a correction.",
  },
  {
    title: "Meals, with the detail that matters",
    body: "Carbohydrates, protein and fat, plus a rescue-carb flag so carbohydrates used to treat a low stay out of any meal estimate.",
  },
  {
    title: "Notes for the things numbers miss",
    body: "A short journal note about how the day felt sits next to the data, so the picture later includes more than the curve.",
  },
];

const ESTIMATE_STEPS = [
  "Describe a meal in your own words, or add a photo.",
  "Stackd suggests carbohydrate, protein and fat values.",
  "You change anything that looks wrong, or discard the suggestion.",
  "Only then is it saved as your log entry.",
];

export default function HowItWorks() {
  useSiteMeta(
    "How Stackd works: a day, step by step",
    "How Stackd works day to day: seeing your reading and trend, logging glucose, insulin and meals, optional meal estimates you review, meal review, split plan reminders, the journal and range views.",
  );

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="How it works"
        title="A day with Stackd, step by step."
        lede="What you actually do, what Stackd shows you, and where the app stops and hands the decision back to you."
      />

      <PublicSection
        tone="paper"
        eyebrow="Start of the day"
        title="See where you are."
        lede="The dashboard opens on the present: the latest reading, its direction, your daily balance and the timeline of what has happened so far."
      >
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-14">
          <div className="mx-auto w-full max-w-[340px] lg:mx-0">
            <GlucosePreview />
          </div>
          <ul className="space-y-5">
            <li>
              <h3 className="text-[15px] font-semibold text-ink">A trend arrow you can trust to mean what it says</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                The direction comes from your recent readings. When there is not enough recent data to tell, Stackd
                shows a neutral mark rather than pretending the level is steady.
              </p>
            </li>
            <li>
              <h3 className="text-[15px] font-semibold text-ink">Old data is labelled, not skipped</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                If the last reading is older than expected, the age is shown beside it. A quiet sensor never looks like a
                fresh number.
              </p>
            </li>
            <li>
              <h3 className="text-[15px] font-semibold text-ink">A projection kept visibly separate</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                Where Stackd shows where things look to be heading, it draws a dashed line and an uncertainty band,
                clearly apart from the measured values.
              </p>
            </li>
          </ul>
        </div>
      </PublicSection>

      <PublicSection
        tone="field"
        eyebrow="Through the day"
        title="Log what happens, in a few taps."
        lede="Everything you add lands on the same timeline, in the order the day happened."
      >
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <ul className="space-y-5">
            {LOG_STEPS.map((step) => (
              <li key={step.title} className="pt-5 first:pt-0" style={{ borderTop: "1px solid rgba(253, 249, 242, 0.20)" }}>
                <h3 className="text-[15px] font-semibold text-field-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-field-muted">{step.body}</p>
              </li>
            ))}
          </ul>
          <div className="lg:pt-2">
            <MealInsulinPreview />
          </div>
        </div>
      </PublicSection>

      <PublicSection
        tone="paper"
        eyebrow="Optional meal estimates"
        title="A shortcut, never a verdict."
        lede="Estimating a meal is optional from beginning to end, and every suggestion waits for your review before it becomes part of your log."
      >
        <div className="grid gap-8 sm:grid-cols-2">
          <ol className="space-y-4">
            {ESTIMATE_STEPS.map((step, index) => (
              <li key={step} className="flex gap-4">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: "rgba(76, 103, 112, 0.10)", color: "#3f5760" }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="text-sm leading-relaxed text-ink">{step}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-3xl bg-paper-sunk p-6" style={{ border: "1px solid #eadccf" }}>
            <h3 className="text-[15px] font-semibold text-ink">What this is not</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              It is not a dietary prescription, a portion measurement, or treatment approval. Meal estimates are a
              starting point for your own entry, produced from the description or photo you chose to give. You can always
              type the numbers yourself instead.
            </p>
          </div>
        </div>
      </PublicSection>

      <PublicSection
        tone="field"
        eyebrow="After the meal"
        title="Meal review, and split plans."
        lede="Some meals keep going after the first hour. Stackd keeps watching and keeps your own plan in view."
      >
        <div className="grid gap-8 sm:grid-cols-2">
          <div className="rounded-3xl p-6" style={{ background: "rgba(253, 249, 242, 0.06)", border: "1px solid rgba(253, 249, 242, 0.22)" }}>
            <h3 className="text-base font-semibold text-field-ink">Meal review</h3>
            <p className="mt-2 text-sm leading-relaxed text-field-ink">
              After a meal, Stackd gathers what followed: the peak, when the reading came back into your range, any
              additional insulin you logged in that window and any rescue carbs, and how the meal tended to absorb.
            </p>
          </div>
          <div className="rounded-3xl p-6" style={{ background: "rgba(253, 249, 242, 0.06)", border: "1px solid rgba(253, 249, 242, 0.22)" }}>
            <h3 className="text-base font-semibold text-field-ink">Split plan review</h3>
            <p className="mt-2 text-sm leading-relaxed text-field-ink">
              For meals that tend to arrive in two waves, you can plan the first portion yourself and choose how long
              until you look again. Stackd reminds you at that point and shows the plan you set. It does not decide the
              second portion for you.
            </p>
          </div>
        </div>
      </PublicSection>

      <PublicSection
        tone="paper"
        eyebrow="Over weeks and months"
        title="Then step back."
        lede="Range views for a window you choose, and a journal where any day can be opened and read in full."
      >
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-14">
          <HistoryPreview />
          <div className="space-y-5">
            <h3 className="text-[15px] font-semibold text-ink">Everything you can look at is your own data</h3>
            <p className="text-sm leading-relaxed text-ink-muted">
              Averages, time in range and daily balance over 30, 90 or 180 days. Days you can open one at a time.
              Estimates labelled as estimates throughout.
            </p>
            <p className="text-sm leading-relaxed text-ink-muted">
              Sharing someone your view never gives them your history. They see only the parts you switch on, which is
              explained on the{" "}
              <Link to="/sharing" className="font-semibold underline decoration-[#9c5228]/40 underline-offset-4" style={{ color: "#8a4a24" }}>
                sharing page
              </Link>
              .
            </p>
          </div>
        </div>
      </PublicSection>

      <PublicSection tone="field" width="narrow">
        <div className="rounded-3xl bg-paper p-7 text-center sm:p-9" style={{ border: "1px solid #eadccf" }}>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">See it with your own data.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
            Creating an account takes a minute, and the onboarding walks through your settings and your glucose source
            without assuming anything about you.
          </p>
          <Link
            to="/register"
            className="mt-6 inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-transform hover:opacity-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9c5228] focus-visible:ring-offset-2"
            style={{ background: "#9c5228", color: "#fdf9f2" }}
          >
            Create an account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PublicSection>
    </PublicShell>
  );
}