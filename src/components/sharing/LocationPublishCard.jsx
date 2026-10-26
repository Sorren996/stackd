import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { publishSharerLocation, describeSharingError } from "@/lib/sharing/sharingApi";
import { describeLocationAge } from "@/lib/sharing/sharingCopy";
import { observedAtFromFix } from "@/lib/sharing/liveLocation";

/**
 * Publish the latest known location.
 *
 * Coordinates are only stored while at least one person actually has location
 * sharing switched on, and they are encrypted before they are saved. This
 * publishes a single current position — never a trail.
 */
export default function LocationPublishCard({ location, onPublished }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const publish = () => {
    if (!navigator.geolocation) {
      setIsError(true);
      setMessage("This device cannot share a location.");
      return;
    }
    setBusy(true);
    setMessage("");
    setIsError(false);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const data = await publishSharerLocation(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy,
            // The position's own observation time, so whoever is following sees
            // when someone was actually there. The server bounds it and falls
            // back to its own time when it is unusable.
            { observedAt: observedAtFromFix(position.timestamp), source: "manual" }
          );
          if (data.published) {
            setMessage("Latest location shared.");
            onPublished?.();
          } else {
            setIsError(false);
            setMessage("Location sharing is off for everyone, so nothing was saved.");
          }
        } catch (error) {
          setIsError(true);
          setMessage(describeSharingError(error));
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setIsError(true);
        setMessage("Location access was not allowed on this device.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const ageMinutes = location?.captured_at
    ? (Date.now() - new Date(location.captured_at).getTime()) / 60000
    : null;

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: "#746959" }}>
        {location?.published
          ? describeLocationAge(ageMinutes)
          : "Nothing published yet. Your latest position is only saved while someone has location sharing switched on."}
      </p>
      <Button className="w-full rounded-full" disabled={busy} onClick={publish}>
        <MapPin className="mr-2 h-4 w-4" />
        {busy ? "Getting your location…" : location?.published ? "Update my location" : "Share my latest location"}
      </Button>
      {message && (
        <p className="text-xs" style={{ color: isError ? "#a2564a" : "#4f5a45" }}>
          {message}
        </p>
      )}
    </div>
  );
}