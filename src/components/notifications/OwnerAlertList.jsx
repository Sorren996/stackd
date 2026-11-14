import { useState } from 'react';
import SectionCard from '@/components/editorial/SectionCard';
import OwnerAlertRow from '@/components/notifications/OwnerAlertRow';
import OwnerAlertEditor from '@/components/notifications/OwnerAlertEditor';
import { OWNER_ROWS, ownerValues, rowSentence } from '@/lib/notifications/notificationModel';

/**
 * The six-row alert list, in the order the owner set: urgent low, Low, High,
 * Changing fast, Sensor problems — then the every-reading stream, which keeps
 * its own card. One row per concern, no duplicate choices.
 */
export default function OwnerAlertList({ draft, thresholds, pendingKeys = [], disabled, onChange }) {
  const [editing, setEditing] = useState(null);
  const units = thresholds?.units || 'mg/dL';
  const values = ownerValues(draft);
  const paused = draft.master_enabled !== true;
  const row = editing ? OWNER_ROWS.find(item => item.key === editing) : null;

  return (
    <section aria-label="Your alerts">
      <SectionCard>
        {OWNER_ROWS.map(item => (
          <OwnerAlertRow
            key={item.key}
            row={item}
            sentence={rowSentence(item.key, draft, units)}
            fixed={item.fixed === true}
            checked={values.on[item.key] === true}
            disabled={disabled || (item.fixed !== true && paused)}
            pending={pendingKeys.includes(`categories.${item.key}`)}
            onToggle={checked => onChange({ categories: { [item.key]: checked } })}
            onEdit={() => setEditing(item.key)}
          />
        ))}
      </SectionCard>
      {row && (
        <OwnerAlertEditor
          key={row.key}
          row={row}
          draft={draft}
          units={units}
          disabled={disabled}
          onSave={onChange}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}