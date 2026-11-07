import { useState } from 'react';
import SectionCard from '@/components/editorial/SectionCard';
import NotificationRuleRow from '@/components/notifications/NotificationRuleRow';
import NotificationRuleEditor from '@/components/notifications/NotificationRuleEditor';
import { CATEGORY_COPY } from '@/lib/notifications/notificationCopy';
import { ALERT_GROUPS, needsAlertSetup } from '@/lib/notifications/notificationPresentation';
export default function NotificationRuleList({ draft, thresholds, grants, disabled, pendingKeys = [], onChange }) {
  const [editor, setEditor] = useState(null);
  const legacy = draft.categories?.low_glucose == null && thresholds?.target_low === 70;
  const allowed = key => key === 'below_range' && thresholds?.target_low === 70 ? false : !grants || grants[key] === true || (key === 'low_glucose' && legacy && grants.below_range === true);
  const groups = ALERT_GROUPS.map(group => ({ ...group, keys: group.keys.filter(allowed) })).filter(group => group.keys.length);
  const display = legacy ? { ...draft, categories: { ...draft.categories, low_glucose: draft.categories?.below_range === true } } : draft;
  const controlKey = key => key === 'low_glucose' && grants && !grants.low_glucose && legacy ? 'below_range' : key;
  const toggle = (key, checked) => {
    if (checked && needsAlertSetup(key, draft)) setEditor({ key, enable: true });
    else onChange({ categories: { [controlKey(key)]: checked } });
  };
  return <div className="space-y-6">
    {!groups.length && <SectionCard><p className="text-sm text-ink-muted">No alert categories are shared with you right now.</p></SectionCard>}
    {groups.map(group => <section key={group.title} aria-label={group.title}>
      <h2 className="mb-2 px-1 font-serif-italic text-lg text-field-ink">{group.title}</h2>
      <SectionCard>{group.keys.map(key => <NotificationRuleRow key={key} rule={CATEGORY_COPY.find(item => item.key === key)} draft={display} thresholds={thresholds} disabled={disabled} pending={pendingKeys.includes(`categories.${controlKey(key)}`)} onToggle={checked => toggle(key, checked)} onEdit={() => setEditor({ key, enable: false })} />)}</SectionCard>
    </section>)}
    {editor && allowed(editor.key) && <NotificationRuleEditor key={editor.key} rule={CATEGORY_COPY.find(item => item.key === editor.key)} draft={draft} thresholds={thresholds} enableOnSave={editor.enable} disabled={disabled} onSave={onChange} onCancel={() => setEditor(null)} />}
  </div>;
}