// The palette for the crash screen, as plain hex values.
//
// These are deliberately literal rather than theme tokens: this screen has to
// stay readable even when the app's stylesheet, theme classes or providers are
// exactly what failed. The ratios are asserted in the tests beside this file,
// so "readable" is measured, not claimed.

export const ERROR_THEME = {
  field: "#4C6770", // slate field, matches the public site and auth screens
  surface: "#FDF9F2", // cream reading surface
  sunken: "#F4ECE1", // details panel
  ink: "#3F3830", // primary text on cream
  muted: "#6B6153", // secondary text on cream
  primary: "#3F3830", // retry button fill
  onPrimary: "#FDF9F2", // retry button label
  focus: "#FDF9F2", // focus ring on the field
};

export function relativeLuminance(hex) {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(full.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}