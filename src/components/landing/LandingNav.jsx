import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/1b816d1eb_stackdappiconver3.png";

const NAV_LINKS = [
  { label: "The Review", href: "#how-it-works" },
  { label: "What it brings", href: "#features" },
  { label: "FAQ", href: "#faq" },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        background: "rgba(247, 241, 232, 0.88)",
        borderBottom: "1px solid #eadccf",
      }}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <a href="#top" className="flex items-center gap-2">
          <img
            src={LOGO_URL}
            alt="Stackd logo"
            className="h-8 w-8 rounded-lg object-contain"
          />
          <span className="text-xl font-bold tracking-tight" style={{ color: "#3f3830" }}>
            Stackd
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium transition-colors hover:opacity-70" style={{ color: "#6b6153" }}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/register"
            className="rounded-full px-5 py-2 text-sm font-semibold transition-transform active:scale-95"
            style={{ background: "#9c5228", color: "#f7f1e8" }}
          >
            Try Stackd
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="transition-colors hover:opacity-70 md:hidden"
            style={{ color: "#6b6153" }}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="md:hidden"
          style={{ borderTop: "1px solid #eadccf" }}
        >
          <div className="flex flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-black/[0.04]"
                style={{ color: "#6b6153" }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}