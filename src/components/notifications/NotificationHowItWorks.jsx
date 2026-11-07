export default function NotificationHowItWorks() {
  return <details className="px-1 text-field-ink">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-serif-italic">How alerts work</summary>
    <div className="space-y-3 pb-4 text-xs leading-relaxed text-field-muted">
      <p>Low glucose covers every new, fresh reading below 70 mg/dL. Urgent low covers every new reading below 55 mg/dL. Custom low and below comfort zone work the same way, each on every new reading below the level you chose. When more than one matches the same reading, one notification uses the strongest level.</p>
      <p>Those low rules have no wait and no reminder interval, because each new reading is its own event. Other alerts follow their own timing choices. Quiet hours, freshness and sharing permissions still apply. Stackd supplements your sensor’s own alarms; phone settings and connection can affect notifications, including sound.</p>
    </div>
  </details>;
}