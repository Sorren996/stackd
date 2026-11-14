// Per-chart scroll-frame channel. No React state, no global cross-chart events.
export default function createChartSelectionSource() {
  let snapshot = null;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(entry) {
      snapshot = entry;
      listeners.forEach(listener => listener(entry));
    },
  };
}