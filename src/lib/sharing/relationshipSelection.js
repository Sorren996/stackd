// Keeping a selected relationship honest.
//
// A sheet that stays open on an id the list no longer holds cannot show anyone
// anything, so the selection is reconciled against the list every time it
// changes: present stays selected, gone clears it.

export function reconcileSelection(relationships, selectedId) {
  if (!selectedId) return null;
  const list = Array.isArray(relationships) ? relationships : [];
  return list.some((r) => r.id === selectedId) ? selectedId : null;
}