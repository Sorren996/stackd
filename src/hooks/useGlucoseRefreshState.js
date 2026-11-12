import { useCallback, useSyncExternalStore } from "react";
import {
  getGlucoseRefreshState,
  subscribeGlucoseRefresh,
} from "@/lib/glucoseRefresh/coordinator";

/**
 * The current account's glucose refresh state (idle / checking / settled and
 * its verification verdict). Read-only: all requests still go through the
 * coordinator, so every caller shares one lifecycle.
 */
export default function useGlucoseRefreshState(userId) {
  const subscribe = useCallback(
    (listener) => subscribeGlucoseRefresh(userId, listener),
    [userId]
  );
  const snapshot = useCallback(() => getGlucoseRefreshState(userId), [userId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}