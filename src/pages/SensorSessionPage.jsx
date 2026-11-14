import SettingsSubPage from "@/components/settings/SettingsSubPage";
import SensorSessionCard from "@/components/settings/SensorSessionCard";

/**
 * The sensor session screen: the existing session card, opened from the
 * Settings row and ready to edit.
 */
export default function SensorSessionPage() {
  return (
    <SettingsSubPage title="Sensor" italicWord="session">
      <SensorSessionCard defaultExpanded />
    </SettingsSubPage>
  );
}