import { Outlet, Link, useLocation } from "react-router-dom";
import { Activity, History, BarChart2, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";

const navItems = [
{ path: "/", label: "Dashboard", icon: Activity },
{ path: "/history", label: "History", icon: History },
{ path: "/analytics", label: "Analytics", icon: BarChart2 }];


export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-900 via-black to-amber-800">
      {/* Top header — logo only */}
      <header className="sticky top-0 z-50" style={{ background: 'rgba(8, 14, 10, 0)' }}>
        <div className="max-w-6xl mx-auto h-14 flex items-center justify-between px-4 bg-gradient-to-b from-black to-transparent">
          <div className="flex items-center gap-2.5">

            <span className="text-base font-semibold tracking-tight text-white">Stackd</span>
          </div>

        </div>
      </header>

      {/* Page content — extra bottom padding for nav bar */}
      <main className="max-w-6xl w-full mx-auto px-4 flex-1 pb-28 py-0">

        <Outlet />
      </main>

      {/* iOS-style glass bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex justify-center pb-safe">
        <div
          className="mx-4 flex items-center gap-1 py-1 rounded-3xl border mb-4 px-4 backdrop-blur-sm border-white/40 bg-white/10"
          style={{
            background: "rgba(8,14,10,0.4)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(255,255,255,0.04)"
          }}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 transition-all px-4 rounded-2xl py-1 ${
                isActive ?
                "bg-white/15 text-white" :
                "text-white/40 hover:text-white/70"}`
                }>
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>);

          })}
        </div>
      </nav>
    </div>);

}