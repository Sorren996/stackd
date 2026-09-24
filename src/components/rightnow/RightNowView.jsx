import { useState } from "react";
import { Plus } from "lucide-react";
import IobAtAGlance from "./IobAtAGlance";
import MealReviewAtAGlance from "./MealReviewAtAGlance";

const TABS = [
{ id: "iob", label: "Insulin on Board" },
{ id: "meal", label: "Meal Review" }];


/**
 * "Right Now" — the at-a-glance combined view.
 * Eyebrow + title, a two-tab segmented control, and a floating copper add
 * button. Tab content swaps below; the last tab is remembered.
 */
export default function RightNowView({
  totalUnits,
  breakdown,
  basalRegimenStatus,
  mealInsight,
  monitoringStatus,
  glucoseTrend,
  onEditDose,
  onDeleteDose,
  onResolve,
  onAddLog,
  glucoseReadings
}) {
  const [tab, setTab] = useState("iob");

  return (
    <div className="relative">
      {/* Eyebrow + title */}
      <div className="px-1 pt-1">
        <span className="section-label mt-2" style={{ color: "#d8cec2", borderBottomColor: "#d8cec255" }}>At a Glance</span>
        <h1 className="hdr mt-2" style={{ color: "#f7f1e8" }}>Right <em style={{ color: "#eadccf" }}>Now</em></h1>
      </div>

      {/* Segmented control */}
      <div className="mt-3 px-1">
        <div
          className="flex gap-1 rounded-full p-1"
          style={{ background: "#f0e8db" }}>
          
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex-1 rounded-full py-2 text-center text-[12px] font-semibold transition-all"
                style={{
                  background: active ? "#3f3830" : "transparent",
                  color: active ? "#f7f1e8" : "#6b6153"
                }}
                aria-pressed={active}>
                
                {t.label}
              </button>);

          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {tab === "iob" ?
        <IobAtAGlance
          totalUnits={totalUnits}
          breakdown={breakdown}
          basalRegimenStatus={basalRegimenStatus}
          onEditDose={onEditDose}
          onDeleteDose={onDeleteDose} /> :


        <MealReviewAtAGlance
          mealInsight={mealInsight}
          monitoringStatus={monitoringStatus}
          glucoseTrend={glucoseTrend}
          onResolve={onResolve}
          glucoseReadings={glucoseReadings} />

        }
      </div>

      {/* Floating copper add button */}
      













      
    </div>);

}