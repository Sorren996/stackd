// Stackd centralized design system — the visual language of the My Flow
// screen, exposed as reusable style objects and color tokens so every
// surface across the app inherits the same premium dark-glass aesthetic.

// Primary accent: teal / mint — positive, active, comfortable states.
export const ACCENT_TEAL = "#2dd4b4";
export const ACCENT_TEAL_SOFT = "#5ba88a";
// Secondary accent: violet — used sparingly for analytical elements.
export const ACCENT_PURPLE = "#8b73f7";
// Status accents
export const ACCENT_AMBER = "#d4a056";
export const ACCENT_CORAL = "#e07a6b";

// Text hierarchy
export const TEXT_PRIMARY = "rgba(255,255,255,0.95)";
export const TEXT_SECONDARY = "rgba(255,255,255,0.55)";
export const TEXT_TERTIARY = "rgba(255,255,255,0.35)";

// Translucent borders / dividers
export const BORDER_SUBTLE = "rgba(255,255,255,0.10)";

// Muted, nature-derived wellness palette (legacy, still referenced)
export const WELLNESS_COLORS = {
  inRange: "#5ba88a",
  below: "#e07a6b",
  above: "#d4a056",
  high: "#c97060",
  insulin: "#5ba3b8",
  good: "#5ba88a",
  fast: "#c97060",
  medium: "#d4a056",
  slow: "#9a8fc7",
  custom: "#8b8b97",
  accent: "#5ba88a",
};

// Unified glass card surface — matches the My Flow cards.
export const GLASS_SURFACE = {
  background: "linear-gradient(150deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))",
  borderColor: "rgba(255,255,255,0.10)",
  boxShadow:
    "0 12px 40px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10), inset 0 1px 1px rgba(255,255,255,0.08), inset 0 -1px 1px rgba(255,255,255,0.03)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

// Floating glass surface — modals, sheets, popovers, tooltips.
export const GLASS_FLOATING = {
  background: "linear-gradient(165deg, rgba(18,28,23,0.80), rgba(10,16,13,0.84))",
  borderColor: "rgba(255,255,255,0.12)",
  boxShadow:
    "0 18px 50px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.10)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

// Modal backdrop — dims the page while keeping ambient glow.
export const MODAL_BACKDROP = {
  background: "rgba(5,10,12,0.6)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

export const CARD_SHADOW =
  "0 6px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)";