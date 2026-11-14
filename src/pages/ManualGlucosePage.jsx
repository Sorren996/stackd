import SettingsSubPage from "@/components/settings/SettingsSubPage";
import ManualGlucoseSwitch from "@/components/settings/ManualGlucoseSwitch";

/**
 * The hand-logging screen: the one switch that decides whether readings are
 * entered by hand, reached from the Glucose source row on Settings.
 */
export default function ManualGlucosePage() {
  return (
    <SettingsSubPage title="Log manually">
      <ManualGlucoseSwitch />
    </SettingsSubPage>
  );
}