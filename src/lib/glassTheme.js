// Muted, nature-derived wellness palette — soft enough to sit over bright backgrounds
export const WELLNESS_COLORS = {
  inRange: "#5ba88a",   // muted sage green
  below: "#e07a6b",     // warm red (glucose below range)
  above: "#d4a056",     // muted warm gold
  high: "#c97060",      // muted terracotta
  insulin: "#5ba3b8",   // muted teal
  good: "#5ba88a",      // muted sage
  fast: "#c97060",      // muted terracotta
  medium: "#d4a056",    // muted gold
  slow: "#9a8fc7",      // muted lavender
  custom: "#8b8b97",    // soft neutral
  accent: "#5ba88a",    // sage — unified highlight for all interactive elements
};

// Soft, diffuse shadow that fades gradually — no hard rectangular edge
export const GLASS_SURFACE = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
  borderColor: "rgba(255,255,255,0.14)",
  boxShadow:
    "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.05)",
  backdropFilter: "blur(4px)",
};

// Smaller card shadow — gentle and diffuse
export const CARD_SHADOW =
  "0 6px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)";