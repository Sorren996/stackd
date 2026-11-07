import { useState } from 'react';
import SectionCard from '@/components/editorial/SectionCard';
import NotificationRuleRow from '@/components/notifications/NotificationRuleRow';
import NotificationRuleEditor from '@/components/notifications/NotificationRuleEditor';
import { CATEGORY_COPY } from '@/lib/notifications/notificationCopy';
import { ALERT_GROUPS, needsAlertSetup } from '@/lib/notifications/notificationPresentation';
export default function NotificationRuleList({ draft, thresholds, grants, disabled, onChange }) {
  const [editor, setEditor] = useState(null);
  const allowed = key => !grants || grants[key] === true;
  const groups = ALERT_GROUPS.map(group => ({ ...group, keys: group.keys.filter(allowed) })).filter(group => group.keys.length);
  const toggle = (key, checked) => {
    if (checked && needsAlertSetup(key, draft)) setEditor({ key, enable: true });
    else onChange({ categories: { [key]: checked } });
  };
  return <div className="space-y-5">
    {!groups.length && <SectionCard><p className="text-sm text-ink-muted">No alert categories are shared with you right now.</p></SectionCard>}
    {groups.map(group => <SectionCard key={group.title}>
      <h2 className="mb-4 font-serif-italic text-xl text-ink">{group.title}</h2>
      {group.keys.map(key => {
        const rule = CATEGORY_COPY.find(item => item.key === key);
        return <NotificationRuleRow key={key} rule={rule} draft={draft} thresholds={thresholds} disabled={disabled} editing={Boolean(editor && allowed(editor.key))} onToggle={checked => toggle(key, checked)} onEdit={() => setEditor({ key, enable: false })}>
          {editor?.key === key && <NotificationRuleEditor key={key} rule={rule} draft={draft} thresholds={thresholds} enableOnSave={editor.enable} disabled={disabled || (editor.enable && !draft.master_enabled)} onSave={onChange} onCancel={() => setEditor(null)} />}
        </NotificationRuleRow>;
      })}
    </SectionCard>)}
  </div>;
}