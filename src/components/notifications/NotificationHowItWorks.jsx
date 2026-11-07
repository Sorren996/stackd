export default function NotificationHowItWorks() {
  return <details className="px-1 text-field-ink">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm underline underline-offset-4">How alerts work</summary>
    <div className="space-y-3 pb-4 text-xs leading-relaxed text-field-muted">
      <p>Custom levels include the number you choose. Comfort-zone alerts start below or above the zone, not at its boundary. Urgent low starts below 55 mg/dL (about 3.1 mmol/L).</p>
      <p>Changing-quickly alerts use four real CGM readings over roughly 15 minutes, not a trend arrow. The estimated pace must reach your chosen rate, with consistent movement between readings. Gaps or unclear movement can prevent an alert. This is separate from your sensor’s own alerts.</p>
      <p>Overlapping conditions may share one notification, with the most serious first. A continuing condition does not start a new alert each time a reading arrives. Level alerts reset after two fresh readings, 3–7 minutes apart, at least 5 mg/dL back beyond the boundary; pace alerts use a 0.5 mg/dL per minute recovery margin. Gaps do not count as recovery.</p>
      <p>Reminders are optional and remain subject to freshness, quiet hours and sharing permissions. Missing-reading alerts require a connected source and a previous reading; gaps older than three hours are not announced.</p>
    </div>
  </details>;
}