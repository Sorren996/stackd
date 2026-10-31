/**
 * The bar's label type, in one place so the four page labels and the centre
 * "Log" label share size, casing, tracking and baseline exactly.
 */
export default function NavLabel({ children, color }) {
  return (
    <span
      className="w-full truncate text-center font-medium leading-none"
      style={{ fontSize: "11px", letterSpacing: 0, color }}
    >
      {children}
    </span>
  );
}