import MealReviewCard from "./MealReviewCard";
import DoseAndPlanSection from "./DoseAndPlanSection";
import BestGuessSection from "./BestGuessSection";
import StillWorkingSection from "./StillWorkingSection";
import WhatYouAteSection from "./WhatYouAteSection";
import { MR } from "./mealReviewTheme";

/**
 * Card 2 — three sections separated by hairlines (the dose and the plan, the
 * modeled guess, the insulin still working), then the footer with what was
 * eaten and the plan line. No enclosing card title.
 */
export default function DosePlanCard({ dosePlan, bestGuess, stillWorking, footer }) {
  return (
    <MealReviewCard>
      <div className="px-6 pt-6">
        {dosePlan && <DoseAndPlanSection {...dosePlan} />}

        <div
          className={dosePlan ? "mt-6 border-t pt-5" : ""}
          style={dosePlan ? { borderColor: MR.hairline } : undefined}
        >
          <BestGuessSection {...bestGuess} />
        </div>

        <div className="mt-4">
          <StillWorkingSection iob={stillWorking.iob}>{stillWorking.children}</StillWorkingSection>
        </div>
      </div>

      <div className="mx-6 mt-4 border-t" style={{ borderColor: MR.hairline }} />
      <WhatYouAteSection {...footer} />
    </MealReviewCard>
  );
}