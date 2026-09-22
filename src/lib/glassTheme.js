// Stackd centralized design system — warm editorial palette.
// Exported as reusable style objects and color tokens so every surface
// across the app inherits the same warm editorial aesthetic.

// State color (steady/connected/positive): muted sage — single color only.
export const ACCENT_SAGE = "#5b6550";
export const ACCENT_SAGE_SOFT = "#5b6550";
// Future/projection accent: muted mustard
export const ACCENT_MUSTARD = "#af751b";
// Status accents (used sparingly, only where semantically necessary)
export const ACCENT_AMBER = "#af751b";   // attention / glucose change
export const ACCENT_CORAL = "#c97060";   // lows — muted, not neon

// ── Backward-compatible aliases (old export names → editorial values) ──
export const ACCENT_TEAL = "#5b6550";       // was teal, now sage
export const ACCENT_TEAL_SOFT = "#5b6550";
export const ACCENT_PURPLE = "#8a7f70";     // was violet, now taupe

// Text hierarchy
export const TEXT_PRIMARY = "#3f3830";     // roasted espresso
export const TEXT_SECONDARY = "#8a7f70";  // warm taupe
export const TEXT_TERTIARY = "#a89e8d";   // faint labels

// Hairline borders / dividers
export const BORDER_SUBTLE = "#eadccf";
export const BORDER_DOTTED = "#d8cec2";

// Muted wellness palette (legacy interface — remapped to editorial colors)
export const WELLNESS_COLORS = {
  inRange: "#5b6550",    // sage
  below: "#c97060",      // muted coral
  above: "#af751b",      // muted mustard
  high: "#af751b",
  insulin: "#8a7f70",    // taupe
  good: "#5b6550",
  fast: "#c97060",
  medium: "#af751b",
  slow: "#8a7f70",
  custom: "#8a7f70",
  accent: "#5b6550",
};

// Flat editorial card surface — no glassmorphism
export const GLASS_SURFACE = {
  background: "transparent",
  borderColor: "transparent",
  boxShadow: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

// Floating overlay surface — #fdf9f2, soft shadow, hairline border
export const GLASS_FLOATING = {
  background: "#fdf9f2",
  borderColor: "#eadccf",
  boxShadow: "0 8px 28px rgba(63,56,48,0.12), 0 2px 8px rgba(63,56,48,0.06)",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

// Modal backdrop — warm scrim
export const MODAL_BACKDROP = {
  background: "rgba(63,56,48,0.25)",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
};

export const CARD_SHADOW = "0 2px 12px rgba(63,56,48,0.06)";