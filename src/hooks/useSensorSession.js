import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadUserSettings } from "@/lib/userSettings";
import { getRemainingMs, shouldShowSessionBanner, getSensorModel } from "@/lib/sensorSession";

/**
 * Read-only sensor session state derived from the shared user-settings query
 * cache (populated by the app prefetch). Deliberately avoids `useAuth` so the
 * always-mounted Layout / banner can never tear the auth context during a
 * hot-reload of the settings module.
 */
export function useSensorSession() {
  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: () => loadUserSettings(),
    staleTime: 30 * 1000,
  });

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const modelId = settings?.cgm_model;
  const startedAt = settings?.sensor_session_started_at
    ? new Date(settings.sensor_session_started_at).getTime()
    : null;
  const modelMeta = getSensorModel(modelId);

  const remainingMs = useMemo(() => {
    if (!modelId || !Number.isFinite(startedAt)) return null;
    return getRemainingMs(modelId, startedAt, now);
  }, [modelId, startedAt, now]);

  const showBanner = shouldShowSessionBanner(remainingMs);

  return { settings, modelId, startedAt, modelMeta, remainingMs, showBanner };
}