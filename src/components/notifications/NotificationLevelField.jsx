import { useId, useState } from 'react';
import { notificationValue } from '@/lib/notifications/notificationForm';
export default function NotificationLevelField({ label, value, min = 40, max = 400, units, disabled, onChange }) {
  const id = useId();
  const [text, setText] = useState(value == null ? '' : notificationValue(value, units));
  const low = notificationValue(min, units), high = notificationValue(max, units);
  const change = event => {
    const raw = event.target.value;
    setText(raw);
    if (raw === '') return onChange(null);
    const number = Number(raw);
    const converted = units === 'mmol/L' ? Math.round(number * 18) : number;
    // Display units round to one decimal. Keep endpoint choices representable.
    const canonical = units === 'mmol/L' && number >= Number(low) && number <= Number(high) ? Math.max(min, Math.min(max, converted)) : converted;
    onChange(canonical);
  };
  return <div className="py-2">
    <label htmlFor={id} className="block text-sm text-ink">{label}</label>
    <div className="mt-2 flex items-center gap-3">
      <input id={id} type="number" inputMode={units === 'mmol/L' ? 'decimal' : 'numeric'} step={units === 'mmol/L' ? '0.1' : '1'} min={low} max={high} value={text} disabled={disabled} onChange={change} aria-describedby={`${id}-hint`} className="min-h-11 w-full min-w-0 rounded-xl border border-border bg-paper px-3 text-base text-ink" />
      <span className="shrink-0 text-sm text-ink-muted">{units}</span>
    </div>
    <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{low}–{high} {units}{label.includes('optional') ? ' · Leave blank for any level' : ''}</p>
  </div>;
}