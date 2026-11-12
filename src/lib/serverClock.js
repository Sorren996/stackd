// Server-corrected clock, shared by every label that describes "now".
//
// The rule: the server's time wins whenever the device disagrees with it by
// more than a minute, and the device clock is only trusted while it agrees.
// That keeps a wrong phone clock from turning a forecast into a past reading
// and from making a fresh reading look old.
//
// Pure module state plus one tiny hook — no component owns the offset, so the
// chart, the reading age and the projection freshness all read the same clock.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

/** How far the device may drift before server time replaces it. */
export const CLOCK_TRUST_MS = 60 * 1000;

const SYNC_INTERVAL_MS = 5 * 60 * 1000;

let skewMs = null; // serverNow - deviceNow
let inFlight = null;

/** Ask the server for the time and remember how far the device is off. */
export async function syncServerClock() {
  if (inFlight) return inFlight;
  const sentAt = Date.now();
  inFlight = (async () => {
    try {
      const res = await base44.functions.invoke("getServerTime", {});
      const serverMs = Number(res?.data?.server_now_ms) || Date.parse(res?.data?.server_now);
      if (!Number.isFinite(serverMs)) return null;
      const roundTrip = Date.now() - sentAt;
      skewMs = serverMs + roundTrip / 2 - Date.now();
      return skewMs;
    } catch {
      // No server time this round: the device clock keeps working as before.
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function serverClockSkewMs() {
  return skewMs ?? 0;
}

/**
 * The best available "now" in epoch milliseconds: the device clock corrected by
 * the measured server offset, or the device clock itself until a measurement
 * exists.
 */
export function serverNowMs() {
  const device = Date.now();
  if (skewMs == null) return device;
  return device + skewMs;
}

/** A live "now" for render, resynced with the server every few minutes. */
export function useServerNow(tickMs = 30 * 1000) {
  const [now, setNow] = useState(() => serverNowMs());

  useEffect(() => {
    let active = true;
    syncServerClock().then(() => {
      if (active) setNow(serverNowMs());
    });
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      syncServerClock().then(() => {
        if (active) setNow(serverNowMs());
      });
    }, SYNC_INTERVAL_MS);
    const ticker = setInterval(() => {
      if (active) setNow(serverNowMs());
    }, tickMs);
    return () => {
      active = false;
      clearInterval(timer);
      clearInterval(ticker);
    };
  }, [tickMs]);

  return now;
}