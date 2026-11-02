// Presentation-only tokens for the expanded Meal Review on Home.
//
// Deliberately local: the global theme (src/index.css) and the shared card /
// disclosure components keep their existing values, so nothing outside this
// section changes. Cream card on the slate ground, rust for what the person
// did, tan for what their own plan and logs estimate.
//
// The section speaks one grammar: a serif sentence-case heading, then dotted
// leader ledger lines and short running sentences. No metric tile grids, no
// status chips, no progress rings.

export const MR = {
  // Ground (the page's slate field) — text sitting directly on it.
  ground: "#4C6770",
  onGround: "#FDF9F2",
  onGroundMuted: "#DDE5E7", // 4.78:1 on the slate ground
  onGroundHairline: "rgba(253, 249, 242, 0.24)",

  // Card surfaces
  card: "#FDF9F2",
  cardSunk: "#F4ECE1",
  border: "#EADCCF",
  radius: 30,

  // Ink
  ink: "#3A3430",
  sec: "#6B5F57",

  // Accents
  rust: "#A0522D",
  rustDeep: "#8A4A12",
  estimate: "#7E5F42", // subdued tan-ink for modeled figures (5.6:1 on cream)
  tan: "#D9BFA3", // tan fill only — never text
  tanSoft: "rgba(217, 191, 163, 0.45)",
  insulin: "#C97B54",
  sage: "#9DB59B",
  band: "#E6EADF",
  hairline: "#E6DCCF",
  dotted: "#D8CCBC",
  track: "rgba(58, 52, 48, 0.08)",
};

export const SERIF = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontWeight: 400,
};

export const SERIF_ITALIC = {
  ...SERIF,
  fontStyle: "italic",
};

// The only heading style inside the cards: serif, sentence case, unspaced.
export const SECTION_HEAD = {
  ...SERIF,
  fontSize: 17,
  lineHeight: 1.3,
  color: MR.ink,
};

// Restrained caps, only for eyebrow labels and axis captions.
export const CAPS = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
};

/**
 * Splits a heading around one italic phrase so a component can render the
 * phrase in serif italic. Presentation only — the phrase must be a substring
 * of the heading, otherwise nothing is split.
 */
export function splitItalic(text, phrase) {
  if (!text) return { before: "", phrase: "", after: "" };
  const index = phrase ? text.indexOf(phrase) : -1;
  if (index < 0) return { before: text, phrase: "", after: "" };
  return {
    before: text.slice(0, index),
    phrase,
    after: text.slice(index + phrase.length),
  };
}