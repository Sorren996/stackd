import React from "react";
import { Link } from "react-router-dom";

const LOGO_URL =
  "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png";

/**
 * The shell for every account screen: signing in, creating an account, resetting
 * a password, authorizing a connection. One cream card on the same slate field
 * as the public site, with nothing to scroll past, so the flow stays focused.
 */
export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen bg-field px-4 py-10 text-field-ink sm:py-16">
      <a
        href="#auth-card"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
      >
        Skip to form
      </a>

      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="mx-auto flex w-fit items-center gap-2 rounded-full px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2]"
          aria-label="Stackd home"
        >
          <img src={LOGO_URL} alt="" width="30" height="30" decoding="async" className="h-[30px] w-[30px] rounded-[9px] object-contain" />
          <span className="text-[17px] font-bold tracking-tight text-field-ink">Stackd</span>
        </Link>

        <div
          id="auth-card"
          className="mt-6 rounded-3xl bg-paper p-6 sm:p-8"
          style={{ boxShadow: "0 2px 4px rgba(24, 35, 39, 0.2), 0 24px 60px rgba(24, 35, 39, 0.28)" }}
        >
          {(Icon || title) && (
            <div className="mb-6 text-center">
              {Icon && (
                <span
                  className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full"
                  style={{ background: "rgba(76, 103, 112, 0.10)" }}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" style={{ color: "#3f5760" }} strokeWidth={1.9} />
                </span>
              )}
              {title && <h1 className="text-[26px] font-bold leading-tight tracking-tight text-ink">{title}</h1>}
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
            </div>
          )}

          {children}
        </div>

        {/* Any link a page puts in the footer sits on the slate field, so it is
            forced to the cream tone here rather than page by page. */}
        {footer && (
          <p className="mt-6 text-center text-sm text-field-muted [&_a]:font-semibold [&_a]:text-[#fdf9f2] [&_a]:underline [&_a]:decoration-[#fdf9f2]/40 [&_a]:underline-offset-4">
            {footer}
          </p>
        )}

        <p className="mt-4 text-center text-xs leading-relaxed text-field-muted">
          Stackd is a companion for recording and seeing your own information. It is not a medical device and does not
          provide medical advice.
        </p>
      </div>
    </div>
  );
}