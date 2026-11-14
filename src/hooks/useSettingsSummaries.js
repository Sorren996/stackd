import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useSensorSession } from "@/hooks/useSensorSession";
import useNotificationCenter from "@/hooks/useNotificationCenter";
import {
  attentionItems,
  insulinRatioLabel,
  notificationsSummary,
  sensorSessionSummary,
  statusBand,
} from "@/lib/settingsSummary";

/**
 * Everything the Settings hub summarises: the sensor band, the attention list,
 * and the one-line values for the sensor, notification and insulin rows.
 *
 * It reads only what the app already stores and reuses the existing queries
 * (connection, sensor session, the settings row, the notification centre), so
 * nothing here saves, decides or changes a setting.
 */
export default function useSettingsSummaries() {
  const { connection, isLoading: connectionLoading } = useDexcomConnection();
  const session = useSensorSession();
  const notifications = useNotificationCenter();

  const { data: latestReadings = [] } = useQuery({
    queryKey: ["settings-latest-reading"],
    queryFn: () =>
      base44.entities.GlucoseReading.filter(
        { source: { $in: ["dexcom", "dexcom_share"] } },
        "-recorded_at",
        1
      ),
    enabled: connection?.status === "connected",
    staleTime: 60 * 1000,
  });

  const nowMs = Date.now();
  const latestAtMs = latestReadings[0]?.recorded_at
    ? Date.parse(latestReadings[0].recorded_at)
    : null;
  const modelId = session.settings?.cgm_model ?? null;
  const now = {
    connection,
    modelId,
    latestAtMs: Number.isFinite(latestAtMs) ? latestAtMs : null,
    remainingMs: session.remainingMs,
    nowMs,
  };

  const personal = notifications.data?.personal ?? null;
  const sensor = sensorSessionSummary({
    modelId,
    startedAtMs: session.startedAt,
    remainingMs: session.remainingMs,
    nowMs,
  });

  // Nothing is claimed before the read that supports it answers: an unanswered
  // query is not "not connected", "no session" or "off".
  const settingsReady = Boolean(session.settings);

  return {
    band: connectionLoading && !connection ? null : statusBand(now),
    attention: settingsReady ? attentionItems({ personal, sensor, ...now }) : [],
    sensorLabel: !settingsReady ? "" : sensor.hasSession ? sensor.value : "No sensor session",
    sensorNote: !settingsReady ? "" : sensor.hasSession ? sensor.note : "Start a new session",
    notificationsLabel: notifications.data
      ? notificationsSummary({ personal, units: notifications.data?.thresholds?.units })
      : "",
    insulinLabel: settingsReady
      ? insulinRatioLabel(session.settings?.meal_insulin_units_per_5g) || "Not set yet"
      : "",
  };
}