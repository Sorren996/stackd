import { MR } from "./mealReviewTheme";

/**
 * The Meal Review card surface. Local to this section so the shared
 * DashboardCard (used by every other screen) keeps its own styling.
 */
export default function MealReviewCard({ children, className = "" }) {
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        background: MR.card,
        border: `1px solid ${MR.border}`,
        borderRadius: MR.radius,
      }}
    >
      {children}
    </div>
  );
}