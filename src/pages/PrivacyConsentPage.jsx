import SettingsSubPage from "@/components/settings/SettingsSubPage";
import PrivacyConsent from "@/components/settings/PrivacyConsent";

export default function PrivacyConsentPage() {
  return (
    <SettingsSubPage title="Privacy and Consent">
      <PrivacyConsent />
    </SettingsSubPage>
  );
}