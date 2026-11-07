import SectionCard from '@/components/editorial/SectionCard';
import ToggleRow from '@/components/notifications/ToggleRow';
import NotificationRuleList from '@/components/notifications/NotificationRuleList';
import NotificationThresholdNote from '@/components/notifications/NotificationThresholdNote';
import NotificationPrivacyControls from '@/components/notifications/NotificationPrivacyControls';
import useNotificationDraft from '@/hooks/useNotificationDraft';
export default function FollowedPersonNotifications({ person, onSave }) {
  const { draft, error, pendingKeys, apply } = useNotificationDraft(person.preferences, onSave);
  const disabled = person.status !== 'active' || !person.glucose_shared;
  return <div className="space-y-5">
    <SectionCard>
      <ToggleRow label={`Notifications about ${person.name}`} description="Choose from the alerts they’ve shared with you." checked={draft.master_enabled === true} pending={pendingKeys.includes('master_enabled')} disabled={disabled} onChange={value => apply({ master_enabled: value })} />
      {person.glucose_shared && <NotificationThresholdNote />}
      {!draft.master_enabled && <p className="pt-2 text-xs text-ink-muted">Alerts are paused. Your choices below are kept.</p>}
    </SectionCard>
    {error && <p role="alert" className="rounded-xl bg-paper p-3 text-sm text-red-text">{error}</p>}
    <NotificationRuleList draft={draft} pendingKeys={pendingKeys} thresholds={person.thresholds} grants={person.glucose_shared ? (person.grants || {}) : {}} disabled={disabled} onChange={apply} />
    <SectionCard><h2 className="mb-3 font-serif-italic text-xl text-ink">Privacy &amp; quiet hours</h2><NotificationPrivacyControls draft={draft} pendingKeys={pendingKeys} disabled={disabled} onChange={apply} /></SectionCard>
  </div>;
}