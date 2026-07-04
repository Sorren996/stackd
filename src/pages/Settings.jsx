import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import InsulinSettings from "@/components/settings/InsulinSettings";
import ProfileSettings from "@/components/settings/ProfileSettings";
import PrivacyConsent from "@/components/settings/PrivacyConsent";

export default function Settings() {
  const { authLogout } = useAuth();
  const queryClient = useQueryClient();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      queryClient.clear();
      await authLogout(true);
    } catch {
      toast.error("Something didn't go as expected. Please try again.");
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="settings-page mx-auto max-w-md space-y-8 pb-12 pt-4">
      {/* Section 1: Insulin Settings */}
      <section>
        <h2 className="mb-4 text-base font-bold text-white">Insulin Settings</h2>
        <InsulinSettings />
      </section>

      {/* Section 2: Profile Settings */}
      <section>
        <ProfileSettings />
      </section>

      {/* Section 3: Privacy and Consent */}
      <section>
        <h2 className="mb-4 text-base font-bold text-white">Privacy and Consent</h2>
        <PrivacyConsent />
      </section>

      {/* Section 4: Log Out */}
      <section>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-white/5 text-white/50 hover:bg-white/5 hover:text-white/80 transition-all text-sm font-medium disabled:opacity-40"
        >
          {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          {isLoggingOut ? "Logging out..." : "Log Out"}
        </button>
      </section>
    </div>
  );
}