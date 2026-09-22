import SettingsSubPage from "@/components/settings/SettingsSubPage";
import ContactSupport from "@/components/settings/ContactSupport";

export default function ContactSupportPage() {
  return (
    <SettingsSubPage title="Contact" italicWord="support">
      <ContactSupport />
    </SettingsSubPage>
  );
}