import SettingsSubPage from "@/components/settings/SettingsSubPage";
import InsulinSettings from "@/components/settings/InsulinSettings";

export default function InsulinSettingsPage() {
  return (
    <SettingsSubPage title="Insulin Settings">
      <InsulinSettings />
    </SettingsSubPage>
  );
}