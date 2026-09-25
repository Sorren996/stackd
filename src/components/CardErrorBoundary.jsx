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
 * contained: that card shows a gentle inline fallback, while its siblings
 * keep rendering normally. The fallback resets when the wrapped content
 * changes (e.g. switching tabs remounts the boundary via its key), so the
 * card recovers on the next interaction.
 */
export default class CardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
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
            This card needed a brief pause. The rest of your view is still here —
            try again in a moment.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}