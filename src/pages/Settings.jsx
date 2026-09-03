import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { Activity, User, Shield, LogOut, Loader2, HeartPulse, LineChart, LifeBuoy, Inbox } from "lucide-react";
import { toast } from "sonner";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsList";
import SensorSessionCard from "@/components/settings/SensorSessionCard";

function readGraphHeight() {
  const v = Number(window.localStorage.getItem("graph_height"));
  return v === 300 || v === 400 ? v : 400;
}

export default function Settings() {
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { connected: dexcomConnected } = useDexcomConnection();
  const graphHeight = readGraphHeight();

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

  const profileSubtext = user?.email || "Name, email & password";

  return (
    <div className="mx-auto max-w-md space-y-5 pb-4 pt-2">
      <h1 className="px-3 text-lg font-bold text-white">Settings</h1>

      <SensorSessionCard />

      <SettingsGroup label="Account">
        <SettingsRow
          to="/settings/profile"
          icon={User}
          title="Profile"
          subtext={profileSubtext}
        />
      </SettingsGroup>

      <SettingsGroup label="Health & Data">
        <SettingsRow
          to="/settings/insulin"
          icon={Activity}
          title="Insulin Settings"
          subtext="Meal & correction settings"
        />
        <SettingsRow
          to="/settings/dexcom"
          icon={HeartPulse}
          title="Glucose Source"
          subtext={dexcomConnected ? "Dexcom connected" : "Not connected"}
          last
        />
      </SettingsGroup>

      <SettingsGroup label="App">
        <SettingsRow
          to="/settings/display"
          icon={LineChart}
          title="Display"
          subtext={`Graph max: ${graphHeight} mg/dL`}
        />
      </SettingsGroup>

      <SettingsGroup label="Privacy & Help">
        <SettingsRow
          to="/settings/privacy-consent"
          icon={Shield}
          title="Privacy & Consent"
          subtext="Privacy, consent & account controls"
        />
        <SettingsRow
          to="/settings/contact-support"
          icon={LifeBuoy}
          title="Contact & Support"
          subtext="Help, feedback & bug reports"
          last
        />
      </SettingsGroup>

      {user?.role === "admin" && (
        <SettingsGroup label="Admin">
          <SettingsRow
            to="/settings/support-inbox"
            icon={Inbox}
            title="Support Inbox"
            subtext="Review community help requests"
          />
        </SettingsGroup>
      )}

      <SettingsGroup>
        <SettingsRow
          onClick={handleLogout}
          icon={isLoggingOut ? Loader2 : LogOut}
          title={isLoggingOut ? "Logging out..." : "Log Out"}
          danger
          last
          iconClassName={isLoggingOut ? "animate-spin" : ""}
        />
      </SettingsGroup>
    </div>
  );
}