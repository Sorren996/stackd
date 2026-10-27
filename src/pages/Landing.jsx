import PublicShell from "@/components/public/PublicShell";
import Hero from "@/components/public/home/Hero";
import WhySection from "@/components/public/home/WhySection";
import TodaySection from "@/components/public/home/TodaySection";
import MealsSection from "@/components/public/home/MealsSection";
import PictureSection from "@/components/public/home/PictureSection";
import FollowerSection from "@/components/public/home/FollowerSection";
import StartSection from "@/components/public/home/StartSection";
import FaqSection from "@/components/public/home/FaqSection";
import ClosingSection from "@/components/public/home/ClosingSection";
import useSiteMeta from "@/hooks/useSiteMeta";

/**
 * The public home page: the person's day first, the app shown as it really is,
 * and one section at a time for why it exists and what it holds together.
 */
export default function Landing() {
  useSiteMeta(
    "Stackd: your day with diabetes, brought together",
    "See glucose trends, logged insulin, meals and patterns in one calm place, with sharing you control. Stackd is a companion app for recording and seeing your own information, not a medical device.",
  );

  return (
    <PublicShell>
      <Hero />
      <WhySection />
      <TodaySection />
      <MealsSection />
      <PictureSection />
      <FollowerSection />
      <StartSection />
      <FaqSection />
      <ClosingSection />
    </PublicShell>
  );
}