/**
 * Floating dashboard card — warm raised cream surface (#fdf9f2),
 * iOS-style 24px radius, no border, one subtle natural shadow.
 * Padding is passed via className (e.g. p-5 for text cards, p-0 for graph).
 */
export default function DashboardCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-[24px] ${className}`}
      style={{
        background: "#fdf9f2",
        boxShadow: "0 8px 28px rgba(63,56,48,0.10)",
      }}
    >
      {children}
    </div>
  );
}