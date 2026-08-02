import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Sparkles, Bell, BookOpen, Trash2, Shield, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { loadUserSettings, saveUserSettings } from "@/lib/userSettings";
import { Link } from "react-router-dom";

export default function CoachPreferences() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isClearing, setIsClearing] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: loadUserSettings,
  });

  const consentActive = user?.health_data_consent_active !== false;

  const updatePreference = async (key, value) => {
    try {
      await saveUserSettings({ [key]: value });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    } catch {
      toast.error("Could not update preference. Please try again.");
    }
  };

  const handleClearAllInsights = async () => {
    setIsClearing(true);
    try {
      const insights = await base44.entities.CoachInsight.list("-created_date", 200);
      for (const insight of insights) {
        await base44.entities.CoachInsight.delete(insight.id);
      }
      queryClient.invalidateQueries({ queryKey: ["unread-coach-insights"] });
      toast.success("All Coach insights cleared");
    } catch {
      toast.error("Could not clear insights. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-800/60" />
      </div>
    );
  }

  const reviewsEnabled = settings?.coach_reviews_enabled !== false;
  const notificationsEnabled = settings?.coach_insight_notifications_enabled !== false;
  const journalExcluded = settings?.coach_exclude_journal === true;

  const preferences = [
    {
      icon: Sparkles,
      title: "Background Reviews",
      description: "Allow the Coach to periodically review your logs and notice patterns, even when the app is closed.",
      checked: reviewsEnabled,
      onChange: (v) => updatePreference("coach_reviews_enabled", v),
    },
    {
      icon: Bell,
      title: "Insight Notifications",
      description: "Show an amber glow on the dashboard leaf when a new Coach insight is available.",
      checked: notificationsEnabled,
      onChange: (v) => updatePreference("coach_insight_notifications_enabled", v),
    },
    {
      icon: BookOpen,
      title: "Exclude Journal",
      description: "Keep your journal entries private from AI review. The Coach won't read your reflections.",
      checked: journalExcluded,
      onChange: (v) => updatePreference("coach_exclude_journal", v),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Consent status */}
      <div className="rounded-3xl border border-white/45 bg-white/25 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 shrink-0 text-teal-600" />
          <div>
            <p className="text-sm font-semibold text-emerald-950">
              {consentActive ? "Health data consent active" : "Health data consent withdrawn"}
            </p>
            <p className="mt-0.5 text-xs text-emerald-800/70">
              {consentActive
                ? "The Coach can access your wellness logs to provide observations."
                : "The Coach is paused. No background reviews or data access until you re-consent."}
            </p>
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="space-y-3">
        <h3 className="px-1 text-sm font-bold uppercase tracking-wider text-emerald-950">Preferences</h3>
        <div className="rounded-3xl border border-white/45 bg-white/25 p-2 backdrop-blur-md">
          {preferences.map((pref, index) => {
            const Icon = pref.icon;
            return (
              <div
                key={pref.title}
                className={`flex items-center gap-4 rounded-2xl px-3 py-3.5 ${
                  index > 0 ? "border-t border-white/30" : ""
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/15">
                  <Icon className="h-5 w-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-950">{pref.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-emerald-800/70">{pref.description}</p>
                </div>
                <Switch
                  checked={pref.checked}
                  onCheckedChange={pref.onChange}
                  disabled={!consentActive}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Data categories */}
      <div className="space-y-3">
        <h3 className="px-1 text-sm font-bold uppercase tracking-wider text-emerald-950">Data Access</h3>
        <div className="space-y-2.5 rounded-3xl border border-white/45 bg-white/25 p-4 backdrop-blur-md">
          {[
            { label: "Glucose readings", enabled: consentActive },
            { label: "Meal and nourishment logs", enabled: consentActive },
            { label: "Insulin activity logs", enabled: consentActive },
            { label: "Split dose plans", enabled: consentActive },
            { label: "Journal entries", enabled: consentActive && !journalExcluded },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-emerald-900">{item.label}</span>
              <span className={`text-[10px] font-medium ${item.enabled ? "text-teal-700" : "text-emerald-800/50"}`}>
                {item.enabled ? "Accessible" : "Excluded"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Coach data */}
      <div className="space-y-3">
        <h3 className="px-1 text-sm font-bold uppercase tracking-wider text-emerald-950">Coach Data</h3>
        <button
          type="button"
          onClick={handleClearAllInsights}
          disabled={isClearing}
          className="w-full flex items-center gap-4 rounded-3xl border border-white/45 bg-white/25 p-4 backdrop-blur-md transition hover:bg-white/35 active:scale-[0.99] disabled:opacity-40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15">
            {isClearing ? <Loader2 className="h-5 w-5 animate-spin text-red-600" /> : <Trash2 className="h-5 w-5 text-red-600" />}
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-emerald-950">Clear All Insights</p>
            <p className="mt-0.5 text-xs text-emerald-800/70">Remove all generated Coach insights from your account.</p>
          </div>
        </button>

        <Link
          to="/settings/privacy-consent"
          className="w-full flex items-center gap-4 rounded-3xl border border-white/45 bg-white/25 p-4 backdrop-blur-md transition hover:bg-white/35 active:scale-[0.99]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/15">
            <Shield className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-emerald-950">Withdraw Coach Consent</p>
            <p className="mt-0.5 text-xs text-emerald-800/70">Pause all Coach data access and background reviews through privacy controls.</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-emerald-900/50" />
        </Link>
      </div>

      <p className="px-4 text-center text-[10px] leading-relaxed text-emerald-800/60">
        The Coach is a wellness companion, not a medical device. It never provides dosing advice,
        clinical assessments, or treatment recommendations. For medical decisions, consult your healthcare team.
      </p>
    </div>
  );
}