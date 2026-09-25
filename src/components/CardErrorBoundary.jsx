import React from "react";

/**
 * CardErrorBoundary — a local, per-card safety net.
 *
 * The app already has a top-level ErrorBoundary, but a single throw anywhere
 * in the dashboard tree (the activity graph, the meal review, the IOB card)
 * unmounts the entire dashboard and shows a full-screen reload prompt. That
 * makes the Right Now cards "fail to load all together" even when the data
 * is fine.
 *
 * Wrapping each card in its own boundary means a stumble in one card is
 * contained: that card shows a gentle inline fallback with a retry, while its
 * siblings keep rendering normally. The boundary also resets itself when the
 * wrapped content changes (e.g. switching tabs remounts it via the tab key),
 * so it recovers on the next interaction without any user action.
 */
export default class CardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Card render caught:", error, info);
  }

  componentDidUpdate(prevProps) {
    // Recover automatically when the children identity changes (tab switch,
    // data refresh remount, etc.) so a transient stumble doesn't stick.
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  handleRetry() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-[24px] p-4"
          style={{
            background: "#fdf9f2",
            boxShadow: "0 8px 28px rgba(63,56,48,0.10)",
          }}
        >
          <p className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
            One moment while this settles
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#746959" }}>
            This card needed a brief pause. The rest of your view is still here.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-3 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition hover:opacity-80"
            style={{ background: "#3f3830", color: "#f7f1e8" }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}