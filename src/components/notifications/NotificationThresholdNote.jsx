import { NOTIFICATION_ISOLATION_COPY, notificationValue } from '@/lib/notifications/notificationForm';
export default function NotificationThresholdNote({ thresholds }) {
  const units = thresholds?.units || 'mg/dL';
  return <div className="border-y border-border py-3 text-xs leading-relaxed text-ink-muted">
    <p>{NOTIFICATION_ISOLATION_COPY}</p>
    <p className="pt-1">Comfort zone (read-only): {notificationValue(thresholds?.target_low, units)}–{notificationValue(thresholds?.target_high, units)} {units}.</p>
  </div>;
}