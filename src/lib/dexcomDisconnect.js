import { base44 } from "@/api/base44Client";

/**
 * The one disconnect path for a Dexcom source.
 *
 * Both the Sensor settings and the manual-glucose switch call this, so a
 * disconnect always removes the connection row and the encrypted credentials
 * together, writes the audit entry, and refreshes every cache that depends on
 * the connection. Nothing here touches stored readings: what the sensor already
 * recorded stays on the chart and in the journal.
 */
export async function disconnectDexcom(queryClient) {
  const res = await base44.functions.invoke("disconnectDexcomShare", {});
  if (res?.data?.error) throw new Error(res.data.error);
  queryClient?.invalidateQueries({ queryKey: ["dexcom-connection"] });
  queryClient?.invalidateQueries({ queryKey: ["latest-dexcom-glucose"] });
}