import { useState } from "react";
import { Navigation } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import useLocationLiveOptIn from "@/hooks/useLocationLiveOptIn";
import { hasActiveLocationFollower } from "@/lib/sharing/liveLocation";

const INK = "#3f3830";
const MUTED = "#746959";
const ACCENT = "#9c5228";

function statusLine({ enabled, followerReady, supported }) {
  if (!supported) return "This device does not offer location.";
  if (!followerReady) {
    return "No one has location switched on for you right now, so nothing will be sent until someone does.";
  }
  if (!enabled) {
    return "Off. Turn it on and your latest position is refreshed while you have Stackd open. You can switch it off again whenever you like.";
  }
  return "On. A fresh position is sent about every five minutes while you have Stackd open. Leaving or closing the app stops it, and nothing is ever collected in the background.";
}

/**
 * The sharer's explicit opt-in for keeping their position fresh.
 *
 * This is theirs alone to set, it is off until they switch it on, and it never
 * widens what a follower may read — it only refreshes the one position they have
 * already chosen to share, while the app is open and in front of them.
 */
export default function LocationLiveUpdatesCard({ relationships }) {
  const { enabled, saving, setEnabled } = useLocationLiveOptIn();
  const [error, setError] = useState("");

  const supported = typeof navigator === "undefined" || Boolean(navigator.geolocation);
  const followerReady = hasActiveLocationFollower(relationships);

  const toggle = async (next) => {
    setError("");
    try {
      await setEnabled(next);
    } catch {
      setError("That did not save. Please try again.");
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        <Navigation className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ACCENT }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: INK }}>
            Keep my location fresh while the app is open
          </p>
          <p className="pt-1 text-xs leading-relaxed" style={{ color: MUTED }}>
            Only while Stackd is open on this device. There is no background tracking and nothing is collected when the
            app is closed.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={saving || !supported}
          onCheckedChange={toggle}
          aria-label="Keep my location fresh while the app is open"
        />
      </div>

      <p className="pt-3 text-xs leading-relaxed" style={{ color: MUTED }}>
        {statusLine({ enabled, followerReady, supported })}
      </p>

      {error && (
        <p className="pt-2 text-xs" style={{ color: "#a2564a" }}>
          {error}
        </p>
      )}
    </div>
  );
}