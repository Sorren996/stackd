import { Flag, PreviewCard, SampleTag, StatRow } from "@/components/public/parts";

/**
 * Insulin and meals in context.
 *
 * The one thing this preview must never do is blur an estimate into a
 * measurement: logged doses, estimated rapid-acting activity and the
 * long-acting basal background are three separate lines with three separate
 * labels, and the optional meal estimate is shown waiting for a person to
 * review it rather than as an answer.
 */
export default function MealInsulinPreview() {
  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <SampleTag />
      </div>

      <PreviewCard
        label="Insulin today"
        right={<Flag tone="brand">Estimated activity</Flag>}
      >
        <StatRow label="Rapid-acting, active now" value="2.6 u" note="estimated" />
        <StatRow label="Long-acting basal" value="18 u" note="logged this morning" />
        <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
          Basal is shown as a background level on its own line. It is never counted as active rapid-acting insulin, and
          the activity figure only estimates what you have logged using the settings you confirmed.
        </p>
      </PreviewCard>

      <PreviewCard label="Meal in review" right={<Flag>Mixed absorption</Flag>}>
        <p className="text-[15px] font-semibold" style={{ color: "#3f3830" }}>
          Oats, yoghurt and berries
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "#746959" }}>
          12:48 PM · tagged as a meal
        </p>
        <StatRow label="Carbohydrates" value="45 g" />
        <StatRow label="Protein" value="12 g" />
        <StatRow label="Fat" value="9 g" />
        <div
          className="mt-3 rounded-2xl p-3"
          style={{ background: "rgba(175, 117, 27, 0.10)", border: "1px solid rgba(175, 117, 27, 0.22)" }}
        >
          <p className="text-[11px] font-semibold" style={{ color: "#8a5a12" }}>
            Optional estimate, waiting for you
          </p>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
            From your description Stackd suggested 45 g carbs, 12 g protein and 9 g fat. You can change every value or
            ignore the suggestion. Nothing is logged until you review it, and this is not treatment approval.
          </p>
        </div>
      </PreviewCard>

      <PreviewCard label="After the meal">
        <StatRow label="Peak reading" value="172 mg/dL" note="1:40 PM" />
        <StatRow label="Back in range" value="2 h 10 min" />
        <StatRow label="Rescue carbs" value="15 g" note="kept out of meal estimates" />
        <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
          Meal review gathers what happened afterwards so you can look back calmly. It describes your own log. It does
          not tell you to take more or less insulin.
        </p>
      </PreviewCard>
    </div>
  );
}