import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png";

// Public pages only. The signed-in app has its own navigation, and this bar
// deliberately carries no Log button or patient controls.
const NAV_LINKS = [
  { label: "How it works", to: "/how-it-works" },
  { label: "Sharing", to: "/sharing" },
  { label: "Install", to: "/install" },
  { label: "Contact", to: "/contact" },
];

export default function PublicNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // A route change always closes the panel, and Escape closes it from anywhere.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 44px tall whether it is a link or a button, so the bar is comfortable to tap.
  const linkClass =
    "inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2] focus-visible:ring-offset-0";

  return (
    <header className="sticky top-0 z-40" style={{ background: "rgba(76, 103, 112, 0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      <nav aria-label="Stackd" className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-8">
        <Link to="/" className="flex items-center gap-2 rounded-full py-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2]" aria-label="Stackd home">
          <img src={LOGO_URL} alt="" width="30" height="30" decoding="async" className="h-[30px] w-[30px] rounded-[9px] object-contain" />
          <span className="text-[17px] font-bold tracking-tight text-field-ink">Stackd</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className={linkClass} style={{ color: "#fdf9f2" }}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Link to="/login" className={linkClass} style={{ color: "#fdf9f2" }}>
            Sign in
          </Link>
          <Link
            to="/register"
            className="hidden rounded-full bg-paper px-4 py-2 text-sm font-semibold text-ink transition-transform hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2] sm:inline-block"
          >
            Create an account
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="public-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-field-ink transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2] lg:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="public-menu" className="border-t border-white/15 px-4 pb-5 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="block rounded-2xl px-3 py-3 text-[15px] font-medium text-field-ink hover:bg-white/10">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/privacy" className="block rounded-2xl px-3 py-3 text-[15px] font-medium text-field-ink hover:bg-white/10">
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/terms" className="block rounded-2xl px-3 py-3 text-[15px] font-medium text-field-ink hover:bg-white/10">
                Terms
              </Link>
            </li>
          </ul>
          <div className="mt-3 flex flex-col gap-2">
            <Link to="/login" className="flex min-h-[44px] items-center justify-center rounded-full border border-white/30 px-4 text-sm font-semibold text-field-ink">
              Sign in
            </Link>
            <Link to="/register" className="flex min-h-[44px] items-center justify-center rounded-full bg-paper px-4 text-sm font-semibold text-ink">
              Create an account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}