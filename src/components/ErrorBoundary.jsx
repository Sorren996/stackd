import React from "react";
import { ERROR_THEME } from "@/lib/startup/errorTheme";
import { redactError, redactStack } from "@/lib/startup/redactError";
import { logStartup } from "@/lib/startupDiagnostics";

/**
 * Catches render errors anywhere in the child tree and shows a readable,
 * bounded fallback instead of a blank screen or a wall of stack text.
 *
 * Every colour here is an inline literal from ERROR_THEME, never a theme token
 * or a `text-white` utility: this screen must stay legible when the stylesheet,
 * the theme classes or the providers are exactly what failed. (The previous
 * version used `text-white`, which this app's global palette remaps to dark
 * espresso — dark text on the slate field, which is the unreadable screen the
 * owner photographed.)
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null, retryFocused: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("Render crash caught:", error, info);
    this.setState({ info });
    // Codes only: the stage and the error's class name. No message, no payload.
    logStartup("render-crash", {
      outcome: "error",
      code: (error && typeof error.name === "string" && error.name) || "Error",
    });
  }

  /**
   * A fresh launch, not a partial re-render: a full document load discards the
   * errored boundary and every query that resolved against the broken state.
   * `replace` so the back button cannot land on the crashed screen again.
   */
  handleRetry = () => {
    this.setState({ hasError: false, error: null, info: null });
    window.location.replace("/");
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const summary = redactError(this.state.error);
    const stack = redactStack(this.state.error && this.state.error.stack);

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: ERROR_THEME.field,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflowY: "auto",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          paddingLeft: 16,
          paddingRight: 16,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 360,
            background: ERROR_THEME.surface,
            borderRadius: 24,
            padding: "26px 22px",
            boxShadow: "0 2px 4px rgba(24, 35, 39, 0.2), 0 24px 60px rgba(24, 35, 39, 0.28)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 21,
              lineHeight: 1.3,
              fontWeight: 700,
              color: ERROR_THEME.ink,
            }}
          >
            We couldn’t open your day
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 14,
              lineHeight: 1.6,
              color: ERROR_THEME.muted,
            }}
          >
            Something went wrong while loading. Your information is safe. Please try again.
          </p>

          <button
            type="button"
            onClick={this.handleRetry}
            onFocus={() => this.setState({ retryFocused: true })}
            onBlur={() => this.setState({ retryFocused: false })}
            style={{
              marginTop: 22,
              width: "100%",
              minHeight: 48,
              borderRadius: 16,
              border: "none",
              background: ERROR_THEME.primary,
              color: ERROR_THEME.onPrimary,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              outline: this.state.retryFocused
                ? `3px solid ${ERROR_THEME.field}`
                : "3px solid transparent",
              outlineOffset: 2,
            }}
          >
            Try again
          </button>

          <details style={{ marginTop: 14 }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: 12,
                lineHeight: 1.4,
                color: ERROR_THEME.muted,
                minHeight: 44,
                display: "flex",
                alignItems: "center",
              }}
            >
              Technical details
            </summary>
            <pre
              style={{
                margin: "6px 0 0",
                maxHeight: 160,
                overflowY: "auto",
                overflowX: "hidden",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                background: ERROR_THEME.sunken,
                borderRadius: 12,
                padding: 12,
                fontSize: 11,
                lineHeight: 1.5,
                color: ERROR_THEME.ink,
              }}
            >
              {stack ? `${summary}\n\n${stack}` : summary}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}