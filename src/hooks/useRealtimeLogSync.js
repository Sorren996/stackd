import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Realtime push for log changes — including server-side Dexcom syncs that
// arrive while the user is on another page or the app is in the background.
// The moment a record is created/updated/deleted, the relevant cached queries
// are marked stale and revalidate, so the Dashboard is already fresh by the
// time the user returns to it.
const ENTITY_QUERY_KEYS = {
  GlucoseReading: [["latest-glucose"], ["glucose-readings"], ["glucose-readings", "graph"]],
  InsulinDose: [["insulin-doses"], ["insulin-doses", "graph"]],
  CarbEntry: [["carb-entries"], ["carb-entries", "graph"]],
};

export function useRealtimeLogSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubs = [];

    Object.entries(ENTITY_QUERY_KEYS).forEach(([entityName, keys]) => {
      try {
        const entity = base44.entities[entityName];
        if (!entity || typeof entity.subscribe !== "function") return;

        const unsub = entity.subscribe(() => {
          keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
        });
        if (unsub) unsubs.push(unsub);
      } catch {
        // Subscription setup failure is non-fatal — interval polling + the
        // visibility refresh still keep data fresh as a fallback.
      }
    });

    return () => {
      unsubs.forEach((u) => {
        try { u(); } catch {}
      });
    };
  }, [queryClient]);
}