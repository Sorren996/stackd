// Projection staleness signal.
//
// A stored projection is complete once a row starts from the newest reading —
// but its SHAPE also depends on meals and doses. Editing a meal's carbs, or
// flipping it to a rescue carb, changes those inputs without touching any
// timestamp, so "the row already starts from the newest reading" stops being
// evidence that the forecast still reflects what is on board.
//
// Every carb or dose write (create, edit, delete) therefore marks the inputs as
// changed here. useLatestProjection treats a mark newer than the stored row as
// a reason to regenerate, on top of the reading-anchor rule.
//
// Deliberately tiny: a timestamp and a listener list. No new state, no network.

let changedAt = 0;
const listeners = new Set();

/** Call after any carb or dose write — including edits and deletions. */
export function markProjectionInputsChanged() {
  changedAt = Date.now();
  listeners.forEach((listener) => {
    try {
      listener(changedAt);
    } catch (error) {
      console.error("[projection] staleness listener failed", error);
    }
  });
}

/** Timestamp of the most recent input change in this session. */
export function projectionInputsChangedAt() {
  return changedAt;
}

export function subscribeProjectionInputsChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}