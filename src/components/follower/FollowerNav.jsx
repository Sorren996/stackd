import { useLocation } from "react-router-dom";
import { CircleUser, HeartHandshake } from "lucide-react";
import NavItem from "@/components/nav/NavItem";
import {
  BAR_HEIGHT,
  BAR_MAX_WIDTH,
  BAR_PADDING_BOTTOM,
  BAR_PADDING_X,
  BAR_SIDE_PADDING,
} from "@/components/nav/navGeometry";

// A viewer has two things to do: look at the person they follow, and manage
// their own choices. No logging, so the bar is a plain pill — no notch and no
// button, rather than an empty hole for an action that does not exist here.
const items = [
  { key: "following", path: "/", label: "Following", Icon: HeartHandshake },
  { key: "settings", path: "/following/settings", label: "Settings", Icon: CircleUser },
];

export default function FollowerNav() {
  const { pathname } = useLocation();
  const activeIndex = pathname.startsWith("/following/settings") ? 1 : 0;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 z-50"
      style={{
        bottom: "calc(0px + env(safe-area-inset-bottom))",
        paddingLeft: BAR_SIDE_PADDING,
        paddingRight: BAR_SIDE_PADDING,
      }}
    >
      {/* Same soft fade as the patient dock, in the viewer's own slate, so a
          card scrolling beneath the pill never shows through the gap. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{
          height: 104,
          zIndex: -1,
          background:
            "linear-gradient(to top, #4C6770 0%, rgba(76,103,112,0.94) 46%, rgba(76,103,112,0) 100%)",
        }}
      />
      <div className="relative mx-auto w-full overflow-visible" style={{ maxWidth: BAR_MAX_WIDTH }}>
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: "var(--nav-surface)",
            border: "1px solid var(--nav-border)",
            borderRadius: BAR_HEIGHT / 2,
            boxShadow: "0 6px 20px rgba(63,56,48,0.18)",
          }}
        />

        <div
          className="relative grid"
          style={{
            height: BAR_HEIGHT,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            paddingLeft: BAR_PADDING_X,
            paddingRight: BAR_PADDING_X,
            paddingBottom: BAR_PADDING_BOTTOM,
            zIndex: 51,
          }}
        >
          {items.map((item) => (
            <NavItem key={item.path} item={item} active={items.indexOf(item) === activeIndex} />
          ))}
        </div>
      </div>
    </nav>
  );
}