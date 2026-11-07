// The state machine behind one follower's push permission switches.
//
// Three separate things live around these switches and must never be confused:
//   * the SHARER's permission for this follower (what this file holds),
//   * the FOLLOWER's own opt-in (theirs alone),
//   * a device token / OS permission (also theirs).
//
// So this state only ever holds the sharer's permission. Keeping the race
// handling here — rather than in the sheet — means a late reply, a stale
// refetch or a rapid double tap can be exercised directly.

export function initialPushState(grants = {}, version = 0, id = null) {
  return {
    id,
    push: { ...(grants || {}) },
    // Categories whose save is in flight. Only these switches are held.
    pending: [],
    // The newest tap per category, so an older reply cannot repaint it.
    seqs: {},
    nextSeq: 0,
    // Highest permission version already in hand for this relationship.
    version: Number(version) || 0,
  };
}

export function pushGrantReducer(state, action) {
  switch (action?.type) {
    // A tap answers immediately, before anything is sent.
    case "toggle": {
      if (state.pending.includes(action.key)) return state;
      // The caller may supply the number so it can quote it back on the reply;
      // otherwise the next one is used.
      const seq = Number.isInteger(action.seq) ? action.seq : state.nextSeq + 1;
      return {
        ...state,
        nextSeq: Math.max(state.nextSeq, seq),
        seqs: { ...state.seqs, [action.key]: seq },
        pending: [...state.pending, action.key],
        push: { ...state.push, [action.key]: action.value === true },
      };
    }

    // The server accepted it: its canonical value wins, and its permission
    // version becomes the newest one we hold.
    case "saved": {
      if (state.seqs[action.key] !== action.seq) {
        return { ...state, pending: state.pending.filter((k) => k !== action.key) };
      }
      return {
        ...state,
        push: { ...state.push, [action.key]: action.grants?.[action.key] === true },
        version: Math.max(state.version, Number(action.version) || 0),
        pending: state.pending.filter((k) => k !== action.key),
      };
    }

    // It failed: this one switch goes back where it was, and says why.
    case "failed": {
      if (state.seqs[action.key] !== action.seq) {
        return { ...state, pending: state.pending.filter((k) => k !== action.key) };
      }
      return {
        ...state,
        push: { ...state.push, [action.key]: action.previous === true },
        pending: state.pending.filter((k) => k !== action.key),
      };
    }

    // Fresh relationship data. A different relationship replaces everything; a
    // read older than a save we already confirmed is ignored; a save still in
    // flight keeps its switch where the sharer put it.
    case "sync": {
      const incoming = initialPushState(action.grants, action.version, action.id);
      if (action.id !== state.id) return incoming;
      if (incoming.version > 0 && state.version > incoming.version) return state;
      const push = { ...incoming.push };
      for (const key of state.pending) push[key] = state.push[key];
      return {
        ...state,
        push,
        version: Math.max(state.version, incoming.version),
      };
    }

    default:
      return state;
  }
}

/** The request number a caller must quote back when its reply arrives. */
export function currentSeq(state, key) {
  return state.seqs[key];
}