import { Outlet, Link, useLocation } from "react-router-dom";
import { Activity, History, BarChart2 } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { path: "/", label: "Dashboard", icon: Activity },
  { path: "/history", label: "History", icon: History },
  { path: "/analytics", label: "Analytics", icon: BarChart2 }
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen text-white relative">
      {/* Fixed gradient backdrop */}
      <div className="fixed inset-0 -z-50 bg-gradient-to-b from-teal-950 via-zinc-950 to-black pointer-events-none" />

      {/* Top header */}
      <header className="sticky top-0 z-50 bg-transparent">
        <div className="max-w-6xl mx-auto h-14 flex items-center justify-center px-4 bg-gradient-to-b from-black/80 to-transparent">
          <img
            src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png"
            alt="Stackd Logo"
            className="h-9 w-auto object-contain"
          />
        </div>
      </header>

      {/* Page content */}
      <main className="max-w-6xl w-full mx-auto px-4 flex-1 pb-28 py-0 relative z-10">
        <Outlet />
      </main>

      {/* iOS-style glass bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-50 flex justify-center pb-safe">
        <div
          className="mx-4 flex items-center gap-1 py-1 rounded-3xl border mb-4 px-4 backdrop-blur-sm border-white/40"
          style={{
            background: "rgba(8,14,10,0.4)",
            backdropFilter: "blur(2px)",
            WebkitBackdropFilter: "blur(2px)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(255,255,255,0.04)"
          }}
        >
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex flex-col items-center gap-1 transition-colors px-4 py-1.5 rounded-2xl ${
                  isActive ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-nav-tab"
                    className="absolute inset-0 bg-white/15 rounded-2xl -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <item.icon className="w-5 h-5 relative z-10" />
                <span className="text-[10px] font-medium relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}