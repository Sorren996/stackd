import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Activity, User, Shield, LogOut, Loader2, ChevronRight, Leaf } from "lucide-react";
import { toast } from "sonner";

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

  const navItems = [
    {
      to: "/settings/insulin",
      icon: Activity,
      title: "Insulin Settings",
      description: "Manage ISF, meal insulin, corrections, Meal Review, and insulin-related preferences.",
    },
    {
      to: "/settings/profile",
      icon: User,
      title: "Profile Settings",
      description: "Manage your name, email address, and password.",
    },
    {
      to: "/settings/privacy-consent",
      icon: Shield,
      title: "Privacy and Consent",
      description: "Review notices, manage acknowledgments, withdraw consent, or delete your account.",
    },
    {
      to: "/settings/coach",
      icon: Leaf,
      title: "Wellness Coach",
      description: "Manage AI Coach reviews, insight notifications, journal access, and insight data.",
    },
  ];

  return (
    <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
      <h1 className="text-soft-shadow px-1 text-lg font-bold text-emerald-950">Settings</h1>

      <div className="space-y-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-4 rounded-3xl border border-white/45 bg-white/25 p-4 backdrop-blur-md transition hover:bg-white/35 active:scale-[0.99]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-500/30 bg-teal-500/15">
                <Icon className="h-5 w-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-950">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-emerald-800/70">{item.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-emerald-900/50" />
            </Link>
          );
        })}
      </div>

      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-white/45 py-4 text-emerald-900/70 transition-all text-sm font-medium hover:bg-white/35 hover:text-emerald-950 disabled:opacity-40"
      >
        {isLoggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        {isLoggingOut ? "Logging out..." : "Log Out"}
      </button>
    </div>
  );
}