import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import NotificationHowItWorks from '@/components/notifications/NotificationHowItWorks';
import SectionCard from "@/components/editorial/SectionCard";
import useNotificationCenter from "@/hooks/useNotificationCenter";
import PersonalNotificationSettings from "@/components/notifications/PersonalNotificationSettings";
import FollowedPersonNotifications from "@/components/notifications/FollowedPersonNotifications";
import {
  saveFollowNotifications,
  savePersonalNotifications,
} from "@/lib/notifications/notificationApi";
import { SUPPLEMENT_NOTE } from "@/lib/notifications/notificationCopy";

/**
 * Notifications for every kind of account: a patient's own alerts, the people a
 * viewer follows, preview privacy and quiet hours.
 *
 * `variant` is set by the route: a viewer reaches the follower version from
 * their own settings, and the "For me" section only exists for someone who
 * tracks for themselves.
 */
export default function NotificationsPage({ variant = "patient" }) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useNotificationCenter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const backTo = variant === "follower" ? "/following/settings" : "/settings";

  const savePersonal = async (preferences) => {
    await queryClient.cancelQueries({ queryKey: ['notification-center', user?.id], exact: true });
    const result = await savePersonalNotifications(preferences);
    queryClient.setQueryData(['notification-center', user?.id], current => current ? { ...current, personal: result.preferences } : current);
    return result.preferences;
  };
  const savePerson = async (accessId, preferences) => {
    await queryClient.cancelQueries({ queryKey: ['notification-center', user?.id], exact: true });
    const result = await saveFollowNotifications(accessId, preferences);
    queryClient.setQueryData(['notification-center', user?.id], current => current ? { ...current, following: current.following.map(person => person.access_id === accessId ? { ...person, preferences: result.preferences } : person) } : current);
    return result.preferences;
  };

  const following = Array.isArray(data?.following) ? data.following : [];
  const activeFollowing = following.filter((person) => person.status === "active");
  const pausedFollowing = following.filter((person) => person.status !== "active");

  return (
    <div className="mx-auto w-full min-w-0 max-w-md space-y-5 break-words pb-[calc(3rem+env(safe-area-inset-bottom))] pt-2">
      <div className="flex items-center gap-2 px-1 pb-1">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition"
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
        <section className="space-y-6" aria-label="People I follow">
          <h2 className="px-1 text-sm font-medium text-field-ink">People I follow</h2>
          {activeFollowing.map(person => <FollowedPersonNotifications key={person.access_id} person={person} onSave={preferences => savePerson(person.access_id, preferences)} />)}
          <p className="px-1 text-xs leading-relaxed text-field-muted">Each person decides what they share. Your choices here can only narrow that.</p>
        </section>
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

      {data && <NotificationHowItWorks />}
      <SectionCard>
        <p className="text-xs leading-relaxed" style={{ color: "#746959" }}>
          {SUPPLEMENT_NOTE}
        </p>
      </SectionCard>
    </div>
  );
}