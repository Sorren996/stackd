import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import LandingNav from "@/components/landing/LandingNav";
import InstallGuide from "@/components/landing/InstallGuide";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Install() {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  useEffect(() => {
    base44.auth.isAuthenticated().then(setIsAuthed).catch(() => setIsAuthed(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#f7f1e8" }}>
      {isAuthed && (
        <div className="sticky top-0 z-30 flex items-center px-4 py-3" style={{ background: "#f7f1e8" }}>
          <Link
            to="/settings/profile"
            className="flex items-center gap-1 text-sm font-medium transition active:opacity-60"
            style={{ color: "#3f3830" }}
          >
            <ChevronLeft size={18} />
            Back to Profile
          </Link>
        </div>
      )}
      {!isAuthed && <LandingNav />}
      <InstallGuide />
      <LandingFooter />
    </div>
  );
}