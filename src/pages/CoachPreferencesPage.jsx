import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Leaf, Shield, Trash2, Loader2, ChevronRight, BookOpen, Bell, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { loadUserSettings, saveUserSettings } from "@/lib/userSettings";
import { Link } from "react-router-dom";

const GLASS = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
  borderColor: "rgba(255,255,255,0.1)",
};

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
        checked ? "bg-teal-500/30 border-teal-400/40" : "bg-white/5 border-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${
          checked ? "translate-x-6 bg-teal-300" : "translate-x-0.5 bg-white/40"
        }`}
      />
    </button>
  );
}

function PreferenceRow({ icon: Icon, title, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border p-4" style={GLASS}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/15 bg-teal-500/8">
        <Icon className="h-5 w-5 text-teal-400/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function CoachPreferencesPage() {
  const queryClient = useQueryClient();
  const [isClearing, setIsClearing] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["user-settings"],
    queryFn: loadUserSettings,
  });

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
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  const reviewsEnabled = settings?.coach_reviews_enabled !== false;
  const notificationsEnabled = settings?.coach_insight_notifications_enabled !== false;
  const journalExcluded = settings?.coach_exclude_journal === true;

  return (
    <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
      <Link
        to="/settings"
        className="flex items-center gap-1 text-xs text-white/40 hover:text-white/60 transition"
      >
        ← Settings
      </Link>

      <div>
        <h1 className="text-lg font-bold text-white">Wellness Coach</h1>
        <p className="text-sm text-white/40 mt-1">
          Manage how your AI Wellness Coach reviews your logs and shares observations.
        </p>
      </div>

      {/* Preferences */}
      <div className="space-y-3">
        <PreferenceRow
          icon={Sparkles}
          title="Background Reviews"
          description="Allow the Coach to periodically review your logs and notice patterns, even when the app is closed."
          checked={reviewsEnabled}
          onChange={(v) => updatePreference("coach_reviews_enabled", v)}
        />
        <PreferenceRow
          icon={Bell}
          title="Insight Notifications"
          description="Show an amber glow on the dashboard leaf when a new Coach insight is available."
          checked={notificationsEnabled}
          onChange={(v) => updatePreference("coach_insight_notifications_enabled", v)}
        />
        <PreferenceRow
          icon={BookOpen}
          title="Exclude Journal"
          description="Keep your journal entries private from AI review. The Coach won't read your reflections."
          checked={journalExcluded}
          onChange={(v) => updatePreference("coach_exclude_journal", v)}
        />
      </div>

      {/* Data categories */}
      <div className="rounded-2xl border p-4" style={GLASS}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/45 mb-3">
          Data the Coach May Access
        </p>
        <div className="space-y-2">
          {[
            { label: "Glucose readings", enabled: true },
            { label: "Meal and nourishment logs", enabled: true },
            { label: "Insulin activity logs", enabled: true },
            { label: "Split dose plans", enabled: true },
            { label: "Journal entries", enabled: !journalExcluded },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-white/70">{item.label}</span>
              <span className={`text-[10px] font-medium ${item.enabled ? "text-teal-300/70" : "text-white/25"}`}>
                {item.enabled ? "Accessible" : "Excluded"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Data management */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/45 px-1">
          Coach Data
        </p>
        <button
          type="button"
          onClick={handleClearAllInsights}
          disabled={isClearing}
          className="w-full flex items-center justify-between gap-4 rounded-2xl border p-4 transition hover:bg-white/[0.03] disabled:opacity-40"
          style={{ ...GLASS, borderColor: "rgba(239,68,68,0.15)" }}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/15 bg-red-500/8">
              {isClearing ? <Loader2 className="h-5 w-5 text-red-400/70 animate-spin" /> : <Trash2 className="h-5 w-5 text-red-400/70" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Clear All Insights</p>
              <p className="text-xs text-white/40 mt-0.5">Remove all generated Coach insights from your account.</p>
            </div>
          </div>
        </button>

        <Link
          to="/settings/privacy-consent"
          className="w-full flex items-center justify-between gap-4 rounded-2xl border p-4 transition hover:bg-white/[0.03]"
          style={GLASS}
        >
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <Shield className="h-5 w-5 text-white/50" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Withdraw Coach Consent</p>
              <p className="text-xs text-white/40 mt-0.5">Stop all Coach data access and review through privacy controls.</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-white/30 shrink-0" />
        </Link>
      </div>

      <p className="text-center text-[10px] text-white/25 px-4 leading-relaxed">
        The Coach is a wellness companion, not a medical device. It never provides dosing advice,
        clinical assessments, or treatment recommendations. For medical decisions, consult your healthcare team.
      </p>
    </div>
  );
}