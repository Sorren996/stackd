import SettingsSubPage from "@/components/settings/SettingsSubPage";
import ProfileSettings from "@/components/settings/ProfileSettings";

export default function ProfileSettingsPage() {
  return (
    <SettingsSubPage title="Profile" italicWord="settings">
      <ProfileSettings />
    </SettingsSubPage>
  );
}