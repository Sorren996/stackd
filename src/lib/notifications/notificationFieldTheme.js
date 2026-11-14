/**
 * Fixed cream-on-ink control styling for the notification settings page.
 *
 * Every card on this page is cream in light and dark mode alike, because the
 * public-surface palette it uses is not theme-dependent. Its controls must
 * therefore be painted from fixed values too: a theme token such as
 * `bg-background` turns near-black when the device is in dark mode, which left
 * the level field, the choice buttons and the timing select dark-on-dark on a
 * cream card.
 *
 * Nothing here is a clinical or behavioural value — it is colour and shape only.
 */

export const CONTROL = {
  fill: "#FDF9F2",        // cream field fill
  ink: "#2E2420",         // value and label ink
  hairline: "rgba(46,36,32,.14)",
  muted: "#8F7E6B",       // unit suffix, stepper, helper line, muted thumb
  rust: "#8C4A28",        // primary fill, checked switch, focus ring
};

/** A field: cream fill, 1px hairline edge, 12px radius, ink at 16px tabular. */
export const fieldStyle = {
  background: CONTROL.fill,
  border: `1px solid ${CONTROL.hairline}`,
  borderRadius: 12,
  color: CONTROL.ink,
  fontVariantNumeric: "tabular-nums",
  colorScheme: "light",
};

/** The "mg" unit beside a value and the helper line beneath it. */
export const mutedStyle = { color: CONTROL.muted };

/** Primary control: rust fill, cream text. */
export const primaryStyle = { background: CONTROL.rust, color: CONTROL.fill };

/** Secondary control: hairline outline on cream, ink text. */
export const secondaryStyle = {
  background: CONTROL.fill,
  border: `1px solid ${CONTROL.hairline}`,
  color: CONTROL.ink,
};

/** The shared rust focus ring, on every field and control. */
export const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-[#8C4A28]";

/**
 * Switch: off is a hairline track with a muted thumb, on is rust with a cream
 * thumb. The label beside it stays ink. Passed to the shared Switch, whose
 * tailwind-merge lets these win over its own theme tokens.
 */
export const switchTrackClass =
  "relative shadow-none duration-100 after:absolute after:-inset-y-3 after:-inset-x-1 data-[state=checked]:bg-[#8C4A28] data-[state=checked]:border-transparent data-[state=unchecked]:bg-[#FDF9F2] data-[state=unchecked]:border-[rgba(46,36,32,0.14)]";

export const switchThumbClass =
  "shadow-none duration-100 bg-[#8F7E6B] data-[state=checked]:bg-[#FDF9F2]";