export default function NotificationHowItWorks() {
  return <details className="px-1 text-field-ink">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-serif-italic">How alerts work</summary>
    <div className="space-y-3 pb-4 text-xs leading-relaxed text-field-muted">
      <p>Six rows, one per concern. Urgent low is fixed below 55 mg/dL, always on, and still comes through quiet hours. Low and High each use the one level you choose: Low speaks on every new reading below it, and High on the first reading at or above it, then not again until you come back down. Changing fast follows the direction and pace you pick, with an optional level. Sensor problems tells you when readings stop arriving.</p>
      <p>Every-reading notes are separate, optional and yours alone. Your low and high rows have no wait and no reminder interval, because each new reading is its own event. Quiet hours, freshness and sharing permissions still apply. Stackd supplements your sensor’s own alarms; phone settings and connection can affect notifications, including sound.</p>
    </div>
  </details>;
}