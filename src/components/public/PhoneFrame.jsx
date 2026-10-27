import { cn } from "@/lib/utils";

/**
 * The app as it is actually seen: a phone-sized screen, at full width on a
 * phone and gently inset on wider screens. Previews are composed from live
 * markup rather than a shrunken desktop screenshot, so every label stays
 * readable at 320px.
 */
export default function PhoneFrame({ children, className }) {
  return (
    <div className={cn("mx-auto w-full max-w-[340px] sm:max-w-[360px]", className)}>
      <div
        className="rounded-[38px] p-2.5"
        style={{
          background: "linear-gradient(160deg, #3f5760 0%, #34474f 100%)",
          boxShadow: "0 2px 4px rgba(24, 35, 39, 0.28), 0 26px 60px rgba(24, 35, 39, 0.34)",
        }}
      >
        <div
          className="overflow-hidden rounded-[30px]"
          style={{ background: "#f7f1e8", border: "1px solid rgba(253, 249, 242, 0.16)" }}
        >
          <div className="px-3.5 pb-4 pt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}