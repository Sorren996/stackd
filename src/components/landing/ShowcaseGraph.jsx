// Static glucose graph SVG that reproduces the visual language of the real
// ActivityGraph — white glucose line, target range band, insulin activity
// curve overlay, and a current-value marker. Used across landing page
// showcases to present the actual app visual, not a generic mockup.

export default function ShowcaseGraph({ height = 150, showInsulin = true, className = "" }) {
  return (
    <div className={`relative w-full overflow-hidden ${className}`} style={{ height }}>
      <svg
        viewBox="0 0 320 140"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* Target range band */}
        <rect x="0" y="47" width="320" height="73" fill="#5b6550" opacity="0.05" />

        {/* Target range reference lines */}
        <line x1="0" y1="47" x2="320" y2="47" stroke="#eadccf" strokeWidth="0.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="120" x2="320" y2="120" stroke="#eadccf" strokeWidth="0.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />

        {/* Insulin activity area */}
        {showInsulin && (
          <path
            d="M 107 120 Q 120 105 133 90 Q 160 75 187 70 Q 213 75 240 85 Q 267 95 293 105 Q 307 112 320 113 L 320 120 L 107 120 Z"
            fill="#9c5228"
            opacity="0.08"
          />
        )}

        {/* Insulin activity line */}
        {showInsulin && (
          <path
            d="M 107 120 Q 120 105 133 90 Q 160 75 187 70 Q 213 75 240 85 Q 267 95 293 105 Q 307 112 320 113"
            fill="none"
            stroke="#9c5228"
            strokeWidth="1.5"
            opacity="0.35"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Glucose line */}
        <path
          d="M 0 90 Q 27 88 53 83 Q 80 73 107 57 Q 133 48 160 50 Q 187 60 213 70 Q 240 75 267 72 Q 293 73 320 72"
          fill="none"
          stroke="#5b6550"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Current value marker (HTML for crisp rendering) */}
      <div
        className="absolute h-2.5 w-2.5 rounded-full"
        style={{
          right: "2px",
          top: "51%",
          transform: "translateY(-50%)",
          background: "#5b6550",
          boxShadow: "0 0 8px rgba(91, 101, 80, 0.3)",
        }}
      />
    </div>
  );
}