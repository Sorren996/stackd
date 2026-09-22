import { format } from "date-fns";

/**
 * Editorial page header: "Your <italic-serif word>" with date/time on the right.
 * The italic word is Georgia italic per the design system.
 */
export default function PageHeader({ italicWord, date = new Date(), showDate = true }) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-1 pb-2">
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: "#3f3830" }}>
        Your <span className="font-serif-italic" style={{ fontWeight: 400 }}>{italicWord}</span>
      </h1>
      {showDate && (
        <span className="text-xs font-medium" style={{ color: "#a89e8d" }}>
          {format(date, "EEEE, MMMM d")}
        </span>
      )}
    </div>
  );
}