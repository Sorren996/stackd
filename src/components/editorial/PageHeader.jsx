import { format } from "date-fns";

/**
 * Editorial page header: "Your <italic-serif word>" with date/time on the right.
 * The italic word is Georgia italic per the design system.
 * Date format: "Mon, Sep 21 · 6:53 PM"
 */
export default function PageHeader({ italicWord, date = new Date(), showDate = true, rightText }) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-1 pb-3">
      <h1 className="text-lg font-semibold tracking-tight" style={{ color: "#3f3830" }}>
        Your <span className="font-serif-italic" style={{ fontWeight: 400 }}>{italicWord}</span>
      </h1>
      {showDate && (
        <span className="text-xs font-medium" style={{ color: "#a89e8d" }}>
          {rightText || format(date, "EEE, MMM d · h:mm aa")}
        </span>
      )}
    </div>
  );
}