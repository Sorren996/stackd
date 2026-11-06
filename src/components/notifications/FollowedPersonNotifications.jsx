import ToggleRow from '@/components/notifications/ToggleRow';
import NotificationRuleList from '@/components/notifications/NotificationRuleList';
import NotificationThresholdNote from '@/components/notifications/NotificationThresholdNote';
import NotificationPrivacyControls from '@/components/notifications/NotificationPrivacyControls';
import useNotificationDraft from '@/hooks/useNotificationDraft';
export default function FollowedPersonNotifications({ person, saving, onSave }) {
  const { draft, error, apply } = useNotificationDraft(person.preferences, onSave);
  const disabled = saving || person.status !== 'active' || !person.glucose_shared;
  return <div>
    <ToggleRow label={`Notifications about ${person.name}`} description="Only categories they explicitly share with you appear below." checked={draft.master_enabled === true} disabled={disabled} onChange={value => apply({ master_enabled: value })} />
    {person.glucose_shared && <NotificationThresholdNote thresholds={person.thresholds} />}
    {error && <p role="alert" className="py-2 text-xs text-destructive">{error}</p>}
    <NotificationRuleList draft={draft} thresholds={person.thresholds} grants={person.grants} disabled={disabled} onChange={apply} />
    <NotificationPrivacyControls draft={draft} disabled={disabled} onChange={apply} />
  </div>;
}