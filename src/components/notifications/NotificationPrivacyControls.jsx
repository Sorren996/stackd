import ToggleRow from '@/components/notifications/ToggleRow';
import QuietHoursFields from '@/components/notifications/QuietHoursFields';
import { PERMISSION_NOTE, PREVIEW_PRIVACY_HINT } from '@/lib/notifications/notificationCopy';
export default function NotificationPrivacyControls({ draft, disabled, onChange }) {
  return <div className="border-t border-border pt-2">
    <ToggleRow label="Show health details in previews" description={PREVIEW_PRIVACY_HINT} checked={draft.show_health_details === true} disabled={disabled} onChange={value => onChange({ show_health_details: value })} />
    <QuietHoursFields enabled={draft.quiet_hours_enabled === true} startHour={draft.quiet_start_hour} endHour={draft.quiet_end_hour} timeZone={draft.quiet_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} urgentDuringQuiet={draft.urgent_during_quiet === true} disabled={disabled} onChange={onChange} />
    <p className="pt-2 text-xs text-ink-muted">{PERMISSION_NOTE} Quiet hours still apply; allowing urgent low during quiet hours does not bypass your phone’s settings or guarantee delivery.</p>
  </div>;
}