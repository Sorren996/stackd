import { Outlet, Link, useLocation } from "react-router-dom";
import { Activity, History, LogOut, BarChart2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function Layout() {
  const location = useLocation();

  const navItems = [
  { path: "/", label: "Dashboard", icon: Activity },
  { path: "/history", label: "History", icon: History },
  { path: "/analytics", label: "Analytics", icon: BarChart2 }];


  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-[hsl(var(--popover))]">Stackd</span>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                    ${isActive ?
                  "bg-primary text-primary-foreground" :
                  "text-muted-foreground hover:text-foreground hover:bg-muted"}`
                  }>
                  
                  <item.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>);

            })}
            <button
              onClick={() => base44.auth.logout()}
              className="ml-2 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              
              <LogOut className="w-4 h-4" />
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>);

}