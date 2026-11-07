import SectionCard from '@/components/editorial/SectionCard';
import ToggleRow from '@/components/notifications/ToggleRow';
import NotificationRuleList from '@/components/notifications/NotificationRuleList';
import NotificationThresholdNote from '@/components/notifications/NotificationThresholdNote';
import NotificationPrivacyControls from '@/components/notifications/NotificationPrivacyControls';
import useNotificationDraft from '@/hooks/useNotificationDraft';
export default function PersonalNotificationSettings({ personal, thresholds, saving, onSave }) {
  const { draft, error, pending, apply } = useNotificationDraft(personal, onSave);
  const disabled = saving || pending;
  return <div className="space-y-5" aria-busy={pending}>
    <SectionCard>
      <ToggleRow label="Notifications about me" description="Choose what you’d like to hear about." checked={draft.master_enabled === true} disabled={disabled} onChange={value => apply({ master_enabled: value })} />
      <NotificationThresholdNote />
      {!draft.master_enabled && <p className="pt-2 text-xs text-ink-muted">Alerts are paused. Your choices below are kept.</p>}
    </SectionCard>
    {error && <p role="alert" className="rounded-xl bg-paper p-3 text-sm text-red-text">{error}</p>}
    {pending && <p role="status" className="px-1 text-xs text-field-ink">Saving your choice…</p>}
    <NotificationRuleList draft={draft} thresholds={thresholds} disabled={disabled} onChange={apply} />
    <SectionCard><h2 className="mb-3 font-serif-italic text-xl text-ink">Privacy &amp; quiet hours</h2><NotificationPrivacyControls draft={draft} disabled={disabled} onChange={apply} /></SectionCard>
  </div>;
}