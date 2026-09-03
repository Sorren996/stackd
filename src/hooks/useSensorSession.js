import { useEffect, useMemo, useState } from "react";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getRemainingMs, shouldShowSessionBanner, getSensorModel } from "@/lib/sensorSession";

/**
 * Derives the current CGM sensor session state from server-side user settings.
 * Ticks every 30s so the countdown and banner stay current without a reload.
 */
export function useSensorSession() {
  const { settings, save, isSaving } = useUserSettings();
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

  return { settings, modelId, startedAt, modelMeta, remainingMs, showBanner, save, isSaving };
}