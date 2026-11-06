import SectionCard from '@/components/editorial/SectionCard';
import ToggleRow from '@/components/notifications/ToggleRow';
import NotificationRuleList from '@/components/notifications/NotificationRuleList';
import NotificationThresholdNote from '@/components/notifications/NotificationThresholdNote';
import NotificationPrivacyControls from '@/components/notifications/NotificationPrivacyControls';
import useNotificationDraft from '@/hooks/useNotificationDraft';
export default function PersonalNotificationSettings({ personal, thresholds, saving, onSave }) {
  const { draft, error, apply } = useNotificationDraft(personal, onSave);
  return <SectionCard label="For me">
    <ToggleRow label="Notifications about me" description="Your own readings, on this device." checked={draft.master_enabled === true} disabled={saving} onChange={value => apply({ master_enabled: value })} />
    <NotificationThresholdNote thresholds={thresholds} />
    {error && <p role="alert" className="py-2 text-xs text-destructive">{error}</p>}
    <NotificationRuleList draft={draft} thresholds={thresholds} disabled={saving} onChange={apply} />
    <NotificationPrivacyControls draft={draft} disabled={saving} onChange={apply} />
  </SectionCard>;
}