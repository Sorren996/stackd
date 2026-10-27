import { Link } from "react-router-dom";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/1b816d1eb_stackdappiconver3.png";

const COLUMNS = [
  {
    title: "Stackd",
    links: [
      { label: "How it works", to: "/how-it-works" },
      { label: "Sharing with someone", to: "/sharing" },
      { label: "Install on your phone", to: "/install" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Create an account", to: "/register" },
      { label: "Sign in", to: "/login" },
      { label: "Forgot password", to: "/forgot-password" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Privacy Notice", to: "/privacy" },
      { label: "Terms of Use", to: "/terms" },
      { label: "Contact and self help", to: "/contact" },
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="bg-field-deep px-4 pb-12 pt-14 text-field-ink sm:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="flex items-center gap-2">
              <img src={LOGO_URL} alt="" width="28" height="28" loading="lazy" decoding="async" className="h-7 w-7 rounded-lg object-contain" />
              <span className="text-base font-bold tracking-tight">Stackd</span>
            </span>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-field-muted">
              Your day with diabetes, brought together. Glucose, insulin, meals and patterns in one calm place.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-field-muted">{column.title}</h2>
              <ul className="mt-3 space-y-1">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="inline-flex min-h-[44px] items-center text-sm text-field-ink transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-white/15 pt-6">
          <p className="max-w-3xl text-xs leading-relaxed text-field-muted">
            Stackd helps you record and see information you enter or connect. It is not a medical device, it does not
            provide medical advice or approve treatment, and it is not a substitute for prescribed care, a glucose
            sensor alarm or emergency services. Product screens on this site show fixed illustrative values, never a
            real person&apos;s records.
          </p>
          <p className="mt-3 text-xs text-field-muted">© {new Date().getFullYear()} Stackd</p>
        </div>
      </div>
    </footer>
  );
}