import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import useLocationLiveOptIn from "@/hooks/useLocationLiveOptIn";
import { getSharingRelationships, publishSharerLocation } from "@/lib/sharing/sharingApi";
import { hasActiveLocationFollower, observedAtFromFix, shouldPublishLocation } from "@/lib/sharing/liveLocation";

const FIX_TIMEOUT_MS = 20000;
const RETRY_COOLDOWN_MS = 60 * 1000;

/**
 * Publishes the sharer's own position while they have Stackd open.
 *
 * This runs only in the patient's own app shell, and only when ALL of these are
 * true: they switched the opt-in on themselves, the browser has granted
 * location, this device offers it, the app is open AND visible, the device is
 * online, and at least one ACTIVE relationship currently has the location scope
 * switched on. Turning the opt-in off, leaving the app, or losing the last
 * location follower all tear the whole thing down.
 *
 * There is no background collection and no closed-app collection: the only
 * things that can trigger a refresh are the app becoming visible, the device
 * coming back online, or a new reading arriving in this open app — at most once
 * every five minutes. The server independently re-checks the identity and the
 * relationship on every publish, so nothing here can widen what anyone sees.
 */
export default function LocationForegroundUpdater() {
  const { enabled } = useLocationLiveOptIn();

  const { data } = useQuery({
    queryKey: ["sharing-relationships"],
    queryFn: getSharingRelationships,
    enabled,
    staleTime: 60 * 1000,
  });
  const followerReady = hasActiveLocationFollower(data?.relationships || []);

  const lastPublishedRef = useRef(0);
  const inFlightRef = useRef(false);
  const permissionRef = useRef("unknown");
  const promptedRef = useRef(false);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    if (!enabled || !followerReady) return;
    if (typeof navigator === "undefined") return;

    let cancelled = false;
    let permissionStatus = null;

    const attempt = () => {
      if (cancelled || Date.now() < cooldownUntilRef.current) return;

      const decision = shouldPublishLocation({
        enabled: true,
        hasLocationFollower: true,
        visible: document.visibilityState === "visible",
        geolocationAvailable: Boolean(navigator.geolocation),
        permissionState: permissionRef.current,
        permissionPrompted: promptedRef.current,
        online: navigator.onLine !== false,
        inFlight: inFlightRef.current,
        lastPublishedAt: lastPublishedRef.current || null,
        now: Date.now(),
      });
      if (!decision.publish) return;

      // A person is asked at most once: the opt-in switch is the moment they
      // said yes, so the browser's prompt belongs there and never afterwards.
      if (permissionRef.current !== "granted") promptedRef.current = true;
      inFlightRef.current = true;

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            await publishSharerLocation(
              position.coords.latitude,
              position.coords.longitude,
              position.coords.accuracy,
              // The position's own observation time, not the send time.
              { observedAt: observedAtFromFix(position.timestamp), source: "foreground_auto" }
            );
            lastPublishedRef.current = Date.now();
            cooldownUntilRef.current = 0;
          } catch {
            cooldownUntilRef.current = Date.now() + RETRY_COOLDOWN_MS;
          } finally {
            inFlightRef.current = false;
          }
        },
        (error) => {
          inFlightRef.current = false;
          // A refusal is final for this session: the updater never keeps asking
          // someone who has said no. Anything else (no fix indoors, a timeout)
          // waits before trying again.
          if (error?.code === 1) permissionRef.current = "denied";
          else cooldownUntilRef.current = Date.now() + RETRY_COOLDOWN_MS;
        },
        { enableHighAccuracy: true, timeout: FIX_TIMEOUT_MS, maximumAge: 0 }
      );
    };

    const onVisibleOrOnline = () => {
      if (document.visibilityState === "visible") attempt();
    };
    document.addEventListener("visibilitychange", onVisibleOrOnline);
    window.addEventListener("online", onVisibleOrOnline);

    // A new reading is the app's own sign that the person is using it right now,
    // so the position is refreshed alongside it — still bounded by the interval
    // above, and only while this app is open and on screen.
    const unsubscribe = base44.entities.GlucoseReading.subscribe((event) => {
      if (event?.type === "create") attempt();
    });

    // Permission is READ here, never requested. Where the browser cannot report
    // it, the first attempt stands in for the answer.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (cancelled) return;
          permissionStatus = status;
          permissionRef.current = status.state;
          status.onchange = () => {
            permissionRef.current = status.state;
            if (status.state === "granted") attempt();
          };
          if (status.state === "granted") attempt();
        })
        .catch(() => attempt());
    } else {
      attempt();
    }

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibleOrOnline);
      window.removeEventListener("online", onVisibleOrOnline);
      unsubscribe?.();
      if (permissionStatus) permissionStatus.onchange = null;
      inFlightRef.current = false;
    };
  }, [enabled, followerReady]);

  return null;
}