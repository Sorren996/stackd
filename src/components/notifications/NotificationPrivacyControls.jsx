import ToggleRow from '@/components/notifications/ToggleRow';
import QuietHoursFields from '@/components/notifications/QuietHoursFields';
import { PERMISSION_NOTE, PREVIEW_PRIVACY_HINT } from '@/lib/notifications/notificationCopy';
export default function NotificationPrivacyControls({ draft, disabled, pendingKeys = [], urgentAlwaysOn = false, onChange }) {
  return <div className="space-y-2">
    <ToggleRow label="Show health details in previews" description={PREVIEW_PRIVACY_HINT} checked={draft.show_health_details === true} pending={pendingKeys.includes('show_health_details')} disabled={disabled} onChange={value => onChange({ show_health_details: value })} />
    <QuietHoursFields enabled={draft.quiet_hours_enabled === true} startHour={draft.quiet_start_hour} endHour={draft.quiet_end_hour} timeZone={draft.quiet_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone} urgentDuringQuiet={draft.urgent_during_quiet === true} urgentAlwaysOn={urgentAlwaysOn} pending={pendingKeys.some(key => key.startsWith('quiet_') || key === 'urgent_during_quiet')} disabled={disabled || pendingKeys.some(key => key.startsWith('quiet_') || key === 'urgent_during_quiet')} onChange={onChange} />
    <p className="pt-2 text-xs text-ink-muted">{PERMISSION_NOTE} {urgentAlwaysOn ? 'Urgent low still comes through quiet hours. Nothing here bypasses your phone’s settings or guarantees delivery.' : 'Quiet hours still apply; allowing urgent low during quiet hours does not bypass your phone’s settings or guarantee delivery.'}</p>
  </div>;
}