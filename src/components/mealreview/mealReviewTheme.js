// Presentation-only tokens for the expanded Meal Review on Home.
//
// Deliberately local: the global theme (src/index.css) and the shared card /
// disclosure components keep their existing values, so nothing outside this
// section changes. Cream card on the slate ground, rust for what the person
// did, tan for what their own plan works out to.

export const MR = {
  // Ground (the page's slate field) — text sitting directly on it.
  ground: "#4D6672",
  onGround: "#F8F4EE",
  onGroundMuted: "#DDE5E7", // 4.78:1 on the slate ground
  onGroundHairline: "rgba(248, 244, 238, 0.24)",

  // Card surfaces
  card: "#F8F4EE",
  border: "#E9E0D4",
  radius: 36,

  // Ink
  ink: "#3A3430",
  sec: "#6B5F57",

  // Accents
  rust: "#A0522D",
  rustDeep: "#8A4A12",
  tan: "#D9BFA3",
  insulin: "#C97B54",
  sage: "#9DB59B",
  band: "#ECE8E0",
  hairline: "#E6DCCF",
  track: "rgba(58, 52, 48, 0.08)",
};

export const SERIF_ITALIC = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontStyle: "italic",
  fontWeight: 400,
};

export const CAPS = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
};