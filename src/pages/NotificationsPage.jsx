import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import SectionCard from "@/components/editorial/SectionCard";
import useNotificationCenter from "@/hooks/useNotificationCenter";
import PersonalNotificationSettings from "@/components/notifications/PersonalNotificationSettings";
import FollowedPersonNotifications from "@/components/notifications/FollowedPersonNotifications";
import {
  describeNotificationError,
  saveFollowNotifications,
  savePersonalNotifications,
} from "@/lib/notifications/notificationApi";
import { SUPPLEMENT_NOTE } from "@/lib/notifications/notificationCopy";

/**
 * Notifications for every kind of account: a patient's own alerts, the people a
 * viewer follows, preview privacy, quiet hours and recent history.
 *
 * `variant` is set by the route: a viewer reaches the follower version from
 * their own settings, and the "For me" section only exists for someone who
 * tracks for themselves.
 */
export default function NotificationsPage({ variant = "patient" }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useNotificationCenter();
  const [saving, setSaving] = useState(false);

  const backTo = variant === "follower" ? "/following/settings" : "/settings";

  const savePersonal = async (preferences) => {
    setSaving(true);
    try {
      await savePersonalNotifications(preferences);
      await refetch();
    } catch (error) {
      toast.error(describeNotificationError(error));
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const savePerson = async (accessId, preferences) => {
    setSaving(true);
    try {
      await saveFollowNotifications(accessId, preferences);
      await refetch();
    } catch (error) {
      toast.error(describeNotificationError(error));
      await refetch();
    } finally {
      setSaving(false);
    }
  };

  const following = Array.isArray(data?.following) ? data.following : [];
  const activeFollowing = following.filter((person) => person.status === "active");
  const pausedFollowing = following.filter((person) => person.status !== "active");

  return (
    <div className="mx-auto max-w-md space-y-5 pb-4 pt-2">
      <div className="flex items-center gap-2 px-1 pb-1">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
          style={{ color: "#f7f1e8" }}
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold" style={{ color: "#f7f1e8" }}>
          Your <span className="font-serif-italic" style={{ fontWeight: 400 }}>notifications</span>
        </h1>
      </div>

      {isLoading && (
        <SectionCard>
          <p className="text-sm" style={{ color: "#6b6153" }}>
            Opening your notification settings…
          </p>
        </SectionCard>
      )}

      {isError && (
        <SectionCard>
          <p className="text-sm" style={{ color: "#3f3830" }}>
            We could not load your notification settings just now.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 text-xs font-semibold underline"
            style={{ color: "#9c5228" }}
          >
            Try again
          </button>
        </SectionCard>
      )}

      {data && variant === "patient" && (
        <PersonalNotificationSettings
          personal={data.personal}
          thresholds={data.thresholds}
          saving={saving}
          onSave={savePersonal}
        />
      )}

      {data && variant === "follower" && (
        <SectionCard label="For me">
          <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>
            You are following someone, so your own notifications live here.{" "}
            <span className="font-serif-italic" style={{ color: "#3f3830" }}>
              What reaches you is below, one person at a time.
            </span>
          </p>
        </SectionCard>
      )}

      {data && activeFollowing.length > 0 && (
        <SectionCard label="People I follow">
          <div className="space-y-4">
            {activeFollowing.map((person) => (
              <div key={person.access_id} className="border-t pt-3 first:border-t-0 first:pt-0" style={{ borderColor: "#eadccf" }}>
                <FollowedPersonNotifications
                  person={person}
                  saving={saving}
                  onSave={(preferences) => savePerson(person.access_id, preferences)}
                />
              </div>
            ))}
          </div>
          <p className="pt-3 text-xs leading-relaxed" style={{ color: "#746959" }}>
            Each person decides what they share. Your choices here can only narrow that.
          </p>
        </SectionCard>
      )}

      {data && pausedFollowing.length > 0 && (
        <SectionCard label="Paused">
          {pausedFollowing.map((person) => (
            <p key={person.access_id} className="py-1 text-sm" style={{ color: "#6b6153" }}>
              {person.name}: sharing is paused, so nothing is sent.
            </p>
          ))}
        </SectionCard>
      )}

      <SectionCard>
        <p className="text-xs leading-relaxed" style={{ color: "#746959" }}>
          {SUPPLEMENT_NOTE}
        </p>
      </SectionCard>
    </div>
  );
}