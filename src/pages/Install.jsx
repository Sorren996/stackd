import { useEffect } from "react";
import LandingNav from "@/components/landing/LandingNav";
import InstallGuide from "@/components/landing/InstallGuide";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Install() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <div className="min-h-screen">
      <LandingNav />
      <InstallGuide />
      <LandingFooter />
    </div>
  );
}