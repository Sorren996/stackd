import SettingsSubPage from "@/components/settings/SettingsSubPage";
import DexcomConnect from "@/components/settings/DexcomConnect";

export default function DexcomSettingsPage() {
  return (
    <SettingsSubPage title="Glucose" italicWord="source">
      <DexcomConnect />
    </SettingsSubPage>
  );
}