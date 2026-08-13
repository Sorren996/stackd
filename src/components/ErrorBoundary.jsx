import React from "react";

/**
 * Catches render errors anywhere in the child tree and shows a gentle
 * fallback instead of a blank screen. Without this, a single component
 * crash unmounts the entire React tree and the user sees only the
 * background gradient.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Render crash caught:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-white/90">
            A brief pause in the flow
          </h2>
          <p className="mb-6 max-w-xs text-sm text-white/50">
            Something stumbled while opening your dashboard. Let's try again.
          </p>
          <button
            onClick={this.handleReload}
            className="rounded-2xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.3), rgba(91,163,184,0.2))",
            }}
          >
            Open again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}