import { useState, useEffect } from "react";
import { computeGlucoseStale, STALE_READING_MINUTES } from "@/lib/glucoseStaleness";

/**
 * Reactive staleness flag. Recomputes immediately when the latest Dexcom
 * reading or connection state changes, and ticks every 30 seconds so the
 * threshold trips on its own as a reading ages past the window — no manual
 * refresh required. Recovery is automatic when a fresh reading lands.
 */
export function useGlucoseStaleness(latestDexcomReading, dexcomConnected) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const update = () => setTick(t => t + 1);
    update();
    const id = setInterval(update, 30 * 1000);
    return () => clearInterval(id);
  }, [latestDexcomReading, dexcomConnected]);

  // Source age is checked during render, never one effect behind on resume.
  return computeGlucoseStale(latestDexcomReading, dexcomConnected);
}

export { STALE_READING_MINUTES };