import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, HeartHandshake, LogOut, Users } from "lucide-react";
import SectionCard from "@/components/editorial/SectionCard";
import { Button } from "@/components/ui/button";
import FollowerPrefsSheet from "@/components/sharing/FollowerPrefsSheet";
import useAccessProfile from "@/hooks/useAccessProfile";
import { useAuth } from "@/lib/AuthContext";
import { sharerName } from "@/lib/sharing/sharerName";
import { stopFollowing, describeSharingError } from "@/lib/sharing/sharingApi";
import { enableSelfTracking } from "@/lib/access/profileApi";

/**
 * A viewer's settings.
 *
 * Everything here can only narrow what the viewer receives or end it. Nothing
 * here can widen a permission, and nothing here can touch the sharer's records.
 */
export default function FollowerSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { following, selfTrackingEnabled } = useAccessProfile();
  const [prefsFor, setPrefsFor] = useState(null);
  const [confirmStopFor, setConfirmStopFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [enabling, setEnabling] = useState(false);

  const people = following.filter((r) => r.status === "active" || r.status === "paused");

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["access-profile"] }),
      queryClient.invalidateQueries({ queryKey: ["shared-view"] }),
    ]);

  const stop = async (relationship) => {
    setBusy(true);
    setError("");
    try {
      await stopFollowing(relationship.id);
      await invalidate();
      setConfirmStopFor(null);
    } catch (err) {
      setError(describeSharingError(err));
    } finally {
      setBusy(false);
    }
  };

  const enableOwnTracking = async () => {
    setEnabling(true);
    setError("");
    try {
      await enableSelfTracking();
      // A full reload so the app re-resolves the account and applies the
      // patient set-up exactly as it is, unchanged.
      window.location.href = "/";
    } catch {
      setError("That did not save. Please try again.");
      setEnabling(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pt-2">
      <h1 className="px-1 text-lg font-semibold" style={{ color: "#fdf9f2" }}>
        Your <span className="font-serif-italic" style={{ fontWeight: 400 }}>settings</span>
      </h1>

      <SectionCard label="People you follow">
        {people.length === 0 ? (
          <p className="text-sm" style={{ color: "#746959" }}>
            No one is sharing with you right now.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: "#eadccf" }}>
            {people.map((relationship) => (
              <div key={relationship.id} className="py-3">
                <div className="flex items-center gap-3">
                  <HeartHandshake className="h-4 w-4 shrink-0" style={{ color: "#746959" }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: "#3f3830" }}>
                    {sharerName(relationship.sharer_display_name)}
                  </span>
                  <Button
                    variant="outline"
                    className="shrink-0 rounded-full"
                    onClick={() => setPrefsFor(relationship)}
                  >
                    <BellRing className="mr-2 h-4 w-4" />
                    Notices
                  </Button>
                </div>

                {confirmStopFor === relationship.id ? (
                  <div className="flex items-center gap-2 pt-3">
                    <span className="min-w-0 flex-1 text-xs" style={{ color: "#746959" }}>
                      Stop following? You will lose access to everything they share.
                    </span>
                    <Button
                      variant="outline"
                      className="shrink-0 rounded-full"
                      disabled={busy}
                      onClick={() => setConfirmStopFor(null)}
                    >
                      Keep
                    </Button>
                    <Button
                      className="shrink-0 rounded-full"
                      disabled={busy}
                      onClick={() => stop(relationship)}
                    >
                      {busy ? "Stopping…" : "Stop"}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="pt-2 text-xs font-semibold underline"
                    style={{ color: "#9c5228" }}
                    onClick={() => setConfirmStopFor(relationship.id)}
                  >
                    Stop following
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="pt-3 text-xs" style={{ color: "#746959" }}>
          Your notice choices can only narrow what reaches you. What each person shares stays their decision.
        </p>
      </SectionCard>

      {error && (
        <SectionCard>
          <p className="text-sm" style={{ color: "#a2564a" }}>
            {error}
          </p>
        </SectionCard>
      )}

      {!selfTrackingEnabled && (
        <SectionCard label="For you as well">
          <div className="flex gap-3">
            <Users className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#9c5228" }} />
            <p className="text-sm" style={{ color: "#746959" }}>
              Want to record your own readings too? That switches on the full Stackd experience for you, including the
              set-up steps it needs.
            </p>
          </div>
          <Button className="mt-4 w-full rounded-full" disabled={enabling} onClick={enableOwnTracking}>
            {enabling ? "Switching on…" : "Track my own glucose as well"}
          </Button>
        </SectionCard>
      )}

      <SectionCard label="What you can see">
        <p className="text-xs leading-relaxed" style={{ color: "#746959" }}>
          Only what each person has switched on, checked again every time this page loads. They choose it, they can
          change it or withdraw it at any moment, and nothing here is a replacement for medical advice or emergency
          care.
        </p>
      </SectionCard>

      <SectionCard label="Account">
        <p className="truncate text-sm" style={{ color: "#3f3830" }}>
          {user?.email || ""}
        </p>
        <Button
          variant="outline"
          className="mt-4 w-full rounded-full"
          onClick={async () => {
            queryClient.clear();
            await logout(false);
            navigate("/login");
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </SectionCard>

      <FollowerPrefsSheet relationship={prefsFor} open={Boolean(prefsFor)} onClose={() => setPrefsFor(null)} />
    </div>
  );
}