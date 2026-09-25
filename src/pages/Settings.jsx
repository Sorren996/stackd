import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { toast } from "sonner";
import PageHeader from "@/components/editorial/PageHeader";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";
import SensorSessionCard from "@/components/settings/SensorSessionCard";

function readGraphHeight() {
  const v = Number(window.localStorage.getItem("graph_height"));
  return v === 300 || v === 400 ? v : 400;
}

export default function Settings() {
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { connected: dexcomConnected, connection } = useDexcomConnection();
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

  const dexcomStatus = dexcomConnected
    ? `${connection?.cgm_model || "G7"}, connected`
    : "not connected";

  return (
    <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
      <PageHeader italicWord="profile" rightText="synced just now" />

      {/* Connection status line */}
      <SectionCard>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: dexcomConnected ? "#5b6550" : "#b8aea0" }}
          />
          <span className="text-xs font-medium" style={{ color: "#6b6153" }}>
            {dexcomConnected
              ? `Dexcom ${connection?.cgm_model || "G7"}, connected, updating every 5 min`
              : "No glucose source connected"}
          </span>
        </div>
      </SectionCard>

      <SensorSessionCard />

      <SectionCard label="Insulin Plan">
        <LedgerRow label="Insulin settings" value="Meal & correction" to="/settings/insulin" />
      </SectionCard>

      <SectionCard label="Glucose">
        <LedgerRow label="Dexcom connection" value={dexcomStatus} to="/settings/dexcom" />
      </SectionCard>

      <SectionCard label="App">
        <LedgerRow label="Display" value={`Graph max: ${graphHeight}`} to="/settings/display" />
        <LedgerRow label="Add to Home Screen" value="Install" to="/install" />
        <LedgerRow label="Support the Creator" value="Optional gifts" to="/settings/support-creator" />
      </SectionCard>

      <SectionCard label="Privacy & Help">
        <LedgerRow label="Privacy & Consent" value="Consent & controls" to="/settings/privacy-consent" />
        <LedgerRow label="Contact & Support" value="Help & feedback" to="/settings/contact-support" />
      </SectionCard>

      {user?.role === "admin" && (
        <SectionCard label="Admin">
          <LedgerRow label="Support Inbox" value="Review requests" to="/settings/support-inbox" />
        </SectionCard>
      )}

      <SectionCard label="Account">
        <LedgerRow label="Profile" value={user?.email || "Name & email"} to="/settings/profile" />
        <LedgerRow
          label={isLoggingOut ? "Logging out..." : "Log Out"}
          onClick={handleLogout}
          danger
        />
      </SectionCard>

      <SectionCard>
        <p className="text-xs leading-relaxed" style={{ color: "#746959" }}>
          Your settings shape what every review shows.{" "}
          <span className="font-serif-italic">Changes apply to logs going forward.</span>
        </p>
      </SectionCard>
    </div>
  );
}