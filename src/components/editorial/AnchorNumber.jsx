/**
 * Large light-weight anchor number — font-weight 300, ~44px, tabular numerals,
 * #3f3830 ink. Short caption in #8a7f70 below/beside it.
 *
 * Optional `dot` renders a small status dot before the caption.
 */
export default function AnchorNumber({ value, unit, caption, dot, dotColor = "#5b6550", subcaption, trendIcon = null, trendColor = "#6b6153" }) {
  return (
    <div className="px-1 py-3">
      <div className="flex items-baseline gap-1.5">
        <span className="anchor-number" style={{ color: "#3f3830" }}>
          {value}
        </span>
        {unit && (
          <span className="text-sm font-medium" style={{ color: "#6b6153" }}>
            {unit}
          </span>
        )}
        {trendIcon && (
          <span className="self-center" style={{ color: trendColor, display: "inline-flex" }}>
            {trendIcon}
          </span>
        )}
      </div>
      {caption && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {dot && (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: dotColor }}
            />
          )}
          <span className="text-sm font-medium" style={{ color: "#6b6153" }}>
            {caption}
          </span>
        </div>
      )}
      {subcaption && (
        <p className="mt-1 text-xs" style={{ color: "#746959" }}>
          {subcaption}
        </p>
      )}
    </div>
  );
}