import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  loadUserSettings,
  saveUserSettings,
  migrateLocalSettingsIfNeeded,
  cacheSettingsLocally,
  clearLocalSettingsCache,
} from "@/lib/userSettings";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { getSupportiveErrorMessage, SUPPORTIVE_SUCCESS } from "@/lib/supportiveErrors";

const SETTINGS_QUERY_KEY = ["user-settings"];

/**
 * Hook for loading, saving, and managing server-side user settings.
 * Handles migration from localStorage, caching, and cross-account isolation.
 */
export function useUserSettings() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load settings from server after authentication
  const { data: serverSettings, isLoading } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      // First attempt migration of any existing local settings
      try {
        await migrateLocalSettingsIfNeeded();
      } catch {
        // Migration failure is non-fatal — continue to load
      }
      return loadUserSettings();
    },
    enabled: !!isAuthenticated && !!user,
    staleTime: 30 * 1000,
  });

  // Cache settings locally after load (scoped to user)
  useEffect(() => {
    if (serverSettings && user?.id) {
      cacheSettingsLocally(user.id, serverSettings);
    }
  }, [serverSettings, user?.id]);

  const saveMutation = useMutation({
    mutationFn: (settingsData) =>
      saveUserSettings({
        ...settingsData,
        username: user?.full_name || user?.email || "unknown",
      }),
    onMutate: () => {
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, saved);
      if (user?.id) cacheSettingsLocally(user.id, saved);
      setSaveSuccess(true);
      toast.success(SUPPORTIVE_SUCCESS.save);
      setTimeout(() => setSaveSuccess(false), 2500);
    },
    onError: (error) => {
      const message = getSupportiveErrorMessage(error, "save");
      setSaveError(message);
      toast.error(message);
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const save = useCallback((settingsData) => {
    saveMutation.mutate(settingsData);
  }, [saveMutation]);

  const clearCache = useCallback(() => {
    clearLocalSettingsCache();
    queryClient.removeQueries({ queryKey: SETTINGS_QUERY_KEY });
  }, [queryClient]);

  return {
    settings: serverSettings,
    isLoading,
    isSaving,
    saveError,
    saveSuccess,
    save,
    clearCache,
  };
}