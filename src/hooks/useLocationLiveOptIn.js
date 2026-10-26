import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { loadUserSettings } from "@/lib/userSettings";

/**
 * The sharer's own foreground-location opt-in.
 *
 * It is a plain stored preference, off until the person switches it on. Writing
 * it goes straight to their settings record rather than through the insulin
 * settings path, so this one boolean cannot disturb a clinical value.
 */
export default function useLocationLiveOptIn() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["user-settings"],
    queryFn: loadUserSettings,
    staleTime: 30 * 1000,
  });

  const enabled = settings?.location_live_updates_enabled === true;

  const setEnabled = useCallback(
    async (next) => {
      setSaving(true);
      try {
        if (settings?.id) {
          await base44.entities.UserSettings.update(settings.id, { location_live_updates_enabled: next });
        } else {
          await base44.entities.UserSettings.create({ location_live_updates_enabled: next });
        }
        await queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      } finally {
        setSaving(false);
      }
    },
    [settings?.id, queryClient]
  );

  return { enabled, saving: saving, setEnabled };
}