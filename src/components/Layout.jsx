import { Outlet, Link, useLocation } from "react-router-dom";
import { Activity, History, BarChart2, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
  { path: "/", label: "Dashboard", icon: Activity },
  { path: "/history", label: "History", icon: History },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top header — logo only */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl overflow-hidden">
              <img
                src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/6be146ac0_stackd_app_icon_ver1.png"
                alt="Stackd"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-base font-semibold tracking-tight text-white">Stackd</span>
          </div>
          <button
            onClick={() => base44.auth.logout()}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Page content — extra bottom padding for nav bar */}
      <main className="max-w-6xl w-full mx-auto px-4 py-6 flex-1 pb-28">
        <Outlet />
      </main>

      {/* iOS-style glass bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex justify-center pb-safe">
        <div
          className="mx-4 mb-4 flex items-center gap-1 px-3 py-2 rounded-3xl border border-white/15"
          style={{
            background: "rgba(15, 25, 35, 0.75)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 px-5 py-2 rounded-2xl transition-all ${
                  isActive
                    ? "bg-white/15 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}