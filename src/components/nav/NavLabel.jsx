/**
 * The bar's label type, in one place so the four page labels and the centre
 * "Log" label share size, casing, tracking and baseline exactly.
 */
export default function NavLabel({ children, color }) {
  return (
    <span
      className="w-full truncate text-center font-semibold uppercase leading-none"
      style={{ fontSize: "10px", letterSpacing: "0.02em", color }}
    >
      {children}
    </span>
  );
}