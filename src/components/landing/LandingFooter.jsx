import { Link } from "react-router-dom";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/1b816d1eb_stackdappiconver3.png";

export default function LandingFooter() {
  return (
    <footer
      className="px-4 py-12"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          <a href="#top" className="flex items-center gap-2">
            <img
              src={LOGO_URL}
              alt="Stackd logo"
              className="h-7 w-7 rounded-lg object-contain"
            />
            <span className="font-bold text-white">Stackd</span>
          </a>
          <span className="text-white/15">|</span>
          <Link
            to="/login"
            className="text-white/55 transition-colors hover:text-white"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="text-white/55 transition-colors hover:text-white"
          >
            Create account
          </Link>
          <Link
            to="/install"
            className="text-white/55 transition-colors hover:text-white"
          >
            Install
          </Link>
          <span className="text-white/55">Privacy</span>
          <span className="text-white/55">Contact</span>
        </div>
        <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-relaxed text-white/35">
          Stackd is a review and organization tool, not a medical device, and
          does not provide medical advice.
        </p>
      </div>
    </footer>
  );
}