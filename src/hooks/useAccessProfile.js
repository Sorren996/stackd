import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { getMyAccessProfile, NOTICE_VERSION } from "@/lib/access/profileApi";

/**
 * Resolves what this account IS, server-side, before any patient gate or
 * patient data query mounts.
 *
 * Failure never strands anyone: an unresolved or errored profile falls back to
 * the patient experience, which is the app exactly as it was. It is never used
 * to hide an existing person's own data.
 */
export default function useAccessProfile() {
  const { user, isAuthenticated } = useAuth();

  const query = useQuery({
    // Keyed by the account, so switching accounts can never serve the previous
    // person's capability or relationships.
    queryKey: ["access-profile", user?.id || "anon"],
    queryFn: getMyAccessProfile,
    enabled: isAuthenticated && Boolean(user?.id),
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  const data = query.data;

  // Still resolving — show a neutral loading state, never a patient empty state.
  const resolving = isAuthenticated && Boolean(user?.id) && !data && !query.isError;

  const notice = data?.notice || null;
  const noticeAccepted = Boolean(notice?.version === NOTICE_VERSION && !notice?.withdrawn_at);

  return {
    ...query,
    resolving,
    resolved: Boolean(data),
    mode: data?.mode || (query.isError ? "patient" : null),
    following: data?.following || [],
    pendingInvitations: data?.pending_invitations || [],
    noticeAccepted,
    selfTrackingEnabled: data?.self_tracking_enabled === true,
    isViewer: data?.mode === "follower",
  };
}