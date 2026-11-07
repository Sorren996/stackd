export default function NotificationHowItWorks() {
  return <details className="px-1 text-field-ink">
    <summary className="flex min-h-11 cursor-pointer items-center text-sm font-serif-italic">How alerts work</summary>
    <div className="space-y-3 pb-4 text-xs leading-relaxed text-field-muted">
      <p>Low glucose covers every new, fresh reading below 70 mg/dL. Urgent low covers every new reading below 55 mg/dL. When both match, one notification uses the urgent presentation.</p>
      <p>Other alerts follow their own timing choices. Quiet hours, freshness and sharing permissions still apply. Stackd supplements your sensor’s own alarms; phone settings and connection can affect notifications.</p>
    </div>
  </details>;
}