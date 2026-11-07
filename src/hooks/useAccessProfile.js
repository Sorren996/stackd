import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { getMyAccessProfile, NOTICE_VERSION } from "@/lib/access/profileApi";

/**
 * Resolves what this account IS, server-side, before any patient gate or
 * patient data query mounts.
 *
 * Unknown or failed role checks remain unknown; no patient/follower default.
 */
export default function useAccessProfile() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();

  const query = useQuery({
    // Keyed by the account, so switching accounts can never serve the previous
    // person's capability or relationships.
    queryKey: ["access-profile", user?.id || "anon"],
    queryFn: ({ signal }) => getMyAccessProfile(user.id, signal),
    enabled: isAuthenticated && !isLoadingAuth && Boolean(user?.id),
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    refetchOnReconnect: false,
    networkMode: 'always',
    retry: false,
  });

  const data = query.data;

  // Still resolving — show a neutral loading state, never a patient empty state.
  const resolving = isAuthenticated && Boolean(user?.id) && !data && !query.isError;

  const notice = data?.notice || null;
  const noticeAccepted = Boolean(notice?.version === NOTICE_VERSION && !notice?.withdrawn_at);

  return {
    ...query,
    resolving,
    resolved: Boolean(data) && !query.isError,
    mode: query.isError ? null : data?.mode || null,
    following: data?.following || [],
    pendingInvitations: data?.pending_invitations || [],
    noticeAccepted,
    selfTrackingEnabled: data?.self_tracking_enabled === true,
    isViewer: data?.mode === "follower",
  };
}