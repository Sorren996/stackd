/**
 * Large light-weight anchor number — font-weight 300, ~44px, tabular numerals,
 * #3f3830 ink. Short caption in #8a7f70 below/beside it.
 *
 * Optional `dot` renders a small status dot before the caption.
 */
export default function AnchorNumber({ value, valueNode = null, unit, caption, dot, dotColor = "#5b6550", subcaption, trendIcon = null, trendColor = "#6b6153", gathering = false }) {
  // The anchor's type lives here, once. A caller that needs its own numeral
  // component (the rolling ticker) is handed this class and style, so a larger
  // number can roll without its size, weight, spacing or colour drifting.
  const numberStyle = { color: "#3a2f28", ...(gathering ? { fontSize: 28, fontWeight: 400, opacity: 0.65 } : {}) };
  const number = typeof valueNode === "function" ?
  valueNode({ className: "anchor-number", style: numberStyle }) :
  valueNode ?? <span className="anchor-number" style={numberStyle}>{value}</span>;

  return (
    <div className="py-3 px-1">
      <div className="flex items-baseline gap-1.5">
        {number}
        {unit &&
        <span className="text-sm font-normal" style={{ color: "#7a6b5d" }}>
            {unit}
          </span>
        }
        {trendIcon &&
        <span className="self-center" style={{ color: trendColor, display: "inline-flex" }}>
            {trendIcon}
          </span>
        }
      </div>
      {caption &&
      <div className="mt-1.5 flex items-center gap-1.5">
          {dot &&
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: dotColor }} />

        }
          <span className="text-sm font-medium" style={{ color: "#7a6b5d" }}>
            {caption}
          </span>
        </div>
      }
      {subcaption &&
      <p className="mt-1 text-xs" style={{ color: "#7a6b5d" }}>
          {subcaption}
        </p>
      }
    </div>);

}