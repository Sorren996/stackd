import SectionCard from '@/components/editorial/SectionCard';
import ToggleRow from '@/components/notifications/ToggleRow';
import OwnerAlertList from '@/components/notifications/OwnerAlertList';
import NotificationThresholdNote from '@/components/notifications/NotificationThresholdNote';
import NotificationPrivacyControls from '@/components/notifications/NotificationPrivacyControls';
import AllReadingsSettings from '@/components/notifications/AllReadingsSettings';
import RemindersLinkRow from '@/components/notifications/RemindersLinkRow';
import useNotificationDraft from '@/hooks/useNotificationDraft';

/**
 * The owner's own alerts: one switch at the top, then the six rows — urgent
 * low, Low, High, Changing fast, Sensor problems and the every-reading stream —
 * then preview privacy and quiet hours.
 */
export default function PersonalNotificationSettings({ personal, thresholds, onSave }) {
  const { draft, error, pendingKeys, apply } = useNotificationDraft(personal, onSave);
  const disabled = false;
  return <div className="space-y-5">
    <SectionCard>
      <ToggleRow label="Notifications about me" description="Choose what you’d like to hear about." checked={draft.master_enabled === true} pending={pendingKeys.includes('master_enabled')} disabled={disabled} onChange={value => apply({ master_enabled: value })} />
      <NotificationThresholdNote />
      {!draft.master_enabled && <p className="pt-2 text-xs text-ink-muted">Alerts are paused. Your choices below are kept.</p>}
    </SectionCard>
    {error && <p role="alert" className="rounded-xl bg-paper p-3 text-sm text-red-text">{error}</p>}
    <OwnerAlertList draft={draft} thresholds={thresholds} pendingKeys={pendingKeys} disabled={disabled} onChange={apply} />
    {/* Owner only: a follower account never reaches this screen, and the
        server refuses to store the stream for a relationship either. */}
    <AllReadingsSettings draft={draft} pendingKeys={pendingKeys} disabled={disabled} onChange={apply} />
    <SectionCard><h2 className="mb-3 font-serif-italic text-xl text-ink">Privacy &amp; quiet hours</h2><NotificationPrivacyControls draft={draft} pendingKeys={pendingKeys} disabled={disabled} urgentAlwaysOn onChange={apply} /></SectionCard>
    {/* Last, below every alert row and quiet hours: the prompts the person
        writes for themselves, which are not alerts at all. */}
    <RemindersLinkRow />
  </div>;
}