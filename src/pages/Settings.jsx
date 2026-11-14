import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import PageHeader from "@/components/editorial/PageHeader";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";
import SettingsStatusBand from "@/components/settings/SettingsStatusBand";
import NeedsAttention from "@/components/settings/NeedsAttention";
import AdminTestNotification from "@/components/settings/AdminTestNotification";
import useSettingsSummaries from "@/hooks/useSettingsSummaries";
import { getAppVersion } from "@/lib/appVersion";
import { isNativeIOS } from "@/lib/nativeShell";

function readGraphHeight() {
  const v = Number(window.localStorage.getItem("graph_height"));
  return v === 300 || v === 400 ? v : 400;
}

/**
 * Settings is a hub, never a second copy: the band says what the sensor is
 * doing, each row carries the one value that matters, and every row opens the
 * screen that owns that setting. Groups follow how often they are reached —
 * the sensor first, then what Stackd does, then people, privacy, help and app.
 */
export default function Settings() {
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { band, attention, sensorLabel, sensorNote, notificationsLabel, remindersLabel, insulinLabel } = useSettingsSummaries();
  const graphHeight = readGraphHeight();
  const nativeIOS = isNativeIOS();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      queryClient.clear();
      await logout(true);
    } catch {
      toast.error("Something didn't go as expected. Please try again.");
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pb-4 pt-2">
      <PageHeader italicWord="profile" rightText="synced just now" />

      {/* Full width, above every group: the sensor at a glance, or the fix. */}
      <SettingsStatusBand band={band} />
      <NeedsAttention items={attention} />

      <SectionCard label="Sensor">
        <LedgerRow
          label="Sensor session"
          value={sensorLabel}
          note={sensorNote}
          to="/settings/sensor"
        />
      </SectionCard>

      <SectionCard label="Your setup">
        <LedgerRow label="Notifications" value={notificationsLabel} to="/settings/notifications" />
        <LedgerRow label="Reminders" value={remindersLabel} to="/settings/reminders" />
        <LedgerRow
          label="Insulin"
          value={insulinLabel}
          note="Carb ratio"
          to="/settings/insulin"
        />
        <LedgerRow label="Display" value={`Chart scale: ${graphHeight}`} to="/settings/display" />
      </SectionCard>

      <SectionCard label="People">
        <LedgerRow label="Sharing with others" value="Who follows you" to="/settings/sharing" />
        <LedgerRow label="People you follow" value="Invitations you accepted" to="/shared" />
      </SectionCard>

      <SectionCard label="Privacy">
        <LedgerRow label="Privacy & Consent" value="Consent & controls" to="/settings/privacy-consent" />
      </SectionCard>

      <SectionCard label="Help">
        <LedgerRow label="Contact & Support" value="Help & feedback" to="/settings/contact-support" />
        {user?.role === "admin" && (
          <LedgerRow label="Support Inbox" value="Review requests" to="/settings/support-inbox" />
        )}
      </SectionCard>

      <SectionCard label="App">
        <LedgerRow label="Profile" value={user?.email || "Name & email"} to="/settings/profile" />
        {!nativeIOS && <LedgerRow label="Install" value="Add to Home Screen" to="/install" />}
        <LedgerRow label="Privacy" to="/privacy" />
        <LedgerRow label="Terms" to="/terms" />
        <p className="pt-2.5 text-[11px]" style={{ color: "#746959" }}>
          Stackd v{getAppVersion()}
        </p>
      </SectionCard>

      {user?.role === "admin" && (
        <SectionCard label="Admin">
          <AdminTestNotification />
        </SectionCard>
      )}

      {/* Sign out stays last, quiet and on its own. */}
      <SectionCard>
        <LedgerRow
          label={isLoggingOut ? "Signing out..." : "Sign out"}
          onClick={handleLogout}
          danger
        />
      </SectionCard>
    </div>
  );
}