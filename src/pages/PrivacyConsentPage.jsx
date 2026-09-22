import SettingsSubPage from "@/components/settings/SettingsSubPage";
import PrivacyConsent from "@/components/settings/PrivacyConsent";

export default function PrivacyConsentPage() {
  return (
    <SettingsSubPage title="Privacy" italicWord="consent">
      <PrivacyConsent />
    </SettingsSubPage>
  );
}