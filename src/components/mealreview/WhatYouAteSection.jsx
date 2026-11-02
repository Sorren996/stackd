import SwipeableRow from "@/components/SwipeableRow";
import { MR, SERIF_ITALIC, SECTION_HEAD } from "./mealReviewTheme";

/**
 * Card 2 footer — "What you ate". The same swipeable rows (edit / remove) and
 * the same amounts as before, plus the plan line and the rescue-carb note.
 * Every row and control is preserved; only its container changed.
 */
export default function WhatYouAteSection({
  entries = [],
  rescueEntries = [],
  openEntryId,
  onOpenChange,
  onEditItems,
  onDeleteEntry,
  planLine,
  rescueGrams = 0,
}) {
  return (
    <div className="px-5 pb-5 pt-4">
      <div style={SECTION_HEAD}>What you ate</div>

      <div className="mt-2.5 space-y-2">
        {entries.map((entry) => {
          const name = entry.food_name || entry.name || "Food";
          const detail = entry.absorption_profile
            ? entry.absorption_profile.charAt(0).toUpperCase() + entry.absorption_profile.slice(1)
            : "";
          return (
            <SwipeableRow
              key={entry.id || name}
              rowId={entry.id}
              isOpen={openEntryId === entry.id}
              onOpenChange={(open) => onOpenChange(open ? entry.id : null)}
              onEdit={() => onEditItems(entries)}
              onDelete={() => onDeleteEntry(entry)}
              editLabel="Edit"
              deleteLabel="Remove"
              itemLabel={name}
            >
              <div className="flex w-full items-baseline gap-2 text-left">
                <span className="min-w-0 flex-1 break-words">
                  <span style={{ fontSize: 13, fontWeight: 500, color: MR.ink }}>{name}</span>
                  {detail && <span style={{ fontSize: 11, color: MR.sec }}>, {detail}</span>}
                </span>
                <span className="shrink-0 tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: MR.sec }}>
                  {Math.round(entry.carbs)} g
                </span>
              </div>
            </SwipeableRow>
          );
        })}

        {rescueEntries.map((entry) => {
          const name = entry.food_name || entry.name || "Rescue carbs";
          return (
            <SwipeableRow
              key={entry.id || `rescue-${name}`}
              rowId={entry.id}
              isOpen={openEntryId === entry.id}
              onOpenChange={(open) => onOpenChange(open ? entry.id : null)}
              onEdit={() => onEditItems(rescueEntries)}
              onDelete={() => onDeleteEntry(entry)}
              editLabel="Edit"
              deleteLabel="Remove"
              itemLabel={name}
            >
              <div className="flex w-full items-baseline gap-2 text-left">
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5 break-words">
                  <span style={{ fontSize: 13, fontWeight: 500, color: MR.ink }}>{name}</span>
                  <span style={{ ...SERIF_ITALIC, fontSize: 12, color: MR.rustDeep }}>rescue</span>
                </span>
                <span className="shrink-0 tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: MR.rustDeep }}>
                  {Math.round(entry.carbs)} g
                </span>
              </div>
            </SwipeableRow>
          );
        })}
      </div>

      {rescueGrams > 0 && (
        <p className="mt-3" style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>
          {rescueGrams}g rescue carbs logged (not part of the math).
        </p>
      )}

      {planLine && (
        <p
          className="mt-4 border-t pt-2.5 tabular-nums"
          style={{ borderColor: MR.hairline, fontSize: 11, lineHeight: 1.6, color: MR.sec }}
        >
          <span style={{ ...SERIF_ITALIC, color: MR.ink }}>Your plan</span>
          {" · "}
          {planLine}
        </p>
      )}
    </div>
  );
}