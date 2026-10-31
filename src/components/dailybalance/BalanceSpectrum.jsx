import { useReducedMotion } from "framer-motion";

// Daily Balance spectrum — a purely visual, muted earthy gradient track with
// a single circular marker positioned by the current Daily Balance
// percentage (0% = far left, 100% = far right). Not interactive, not
// draggable. The marker is clamped so it never extends outside the track.
//
// The gradient is deliberately calm (sage -> taupe -> warm clay) so a low
// score never reads as an alarm. Daily Balance is a summary, not a danger
// indicator; real glucose risk continues to use Stackd's existing warning
// treatment elsewhere.

const GRADIENT = "linear-gradient(90deg, #d9b48f 0%, #8fa68c 100%)";

export default function BalanceSpectrum({ percentage, markerSize = 18, trackHeight = 8 }) {
  const prefersReducedMotion = useReducedMotion();
  const raw = Number.isFinite(percentage) ? percentage : 0;
  const clamped = Math.max(0, Math.min(100, raw));
  const half = markerSize / 2;

  // Marker center travels from `half`px (left, fully inside) to
  // `100% - half`px (right, fully inside), interpolated by the percentage.
  const left = `calc(${half}px + (${clamped} / 100) * (100% - ${markerSize}px))`;

  return (
    <div className="relative w-full" style={{ height: markerSize }}>
      {/* Track */}
      <div
        className="absolute left-0 right-0 rounded-full"
        style={{ top: half - trackHeight / 2, height: trackHeight, background: GRADIENT, opacity: 0.9 }}
      />
      {/* Marker — a slim status tick, not a grab handle */}
      <div
        className="absolute rounded-full"
        style={{
          top: half - markerSize / 2 + 1,
          width: 3,
          height: markerSize - 2,
          left,
          transform: "translate(-50%, 0)",
          background: "#8a4a2a",
          transition: prefersReducedMotion ? "none" : "left 0.5s cubic-bezier(0.32, 0.72, 0.25, 1)",
        }}
      />
    </div>
  );
}