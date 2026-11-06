import { notificationValue } from '@/lib/notifications/notificationForm';
export default function NotificationLevelField({ label, value, min = 40, max = 400, units, disabled, onChange }) {
  return <label className="flex items-center justify-between gap-3 py-2 text-xs text-ink-muted">
    <span>{label} ({units})</span>
    <select aria-label={label} className="max-w-[45%] rounded-lg border border-border bg-paper px-2 py-2 text-ink" value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">Not set</option>
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(n => <option key={n} value={n}>{notificationValue(n, units)}</option>)}
    </select>
  </label>;
}