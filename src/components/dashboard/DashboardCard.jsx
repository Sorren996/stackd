/**
 * Floating dashboard card — warm raised cream surface (#fdf9f2),
 * iOS-style 24px radius, no border, one subtle natural shadow.
 * Padding is passed via className (e.g. p-5 for text cards, p-0 for graph).
 */
export default function DashboardCard({ children, className = "" }) {
  return (
    <div
      className={`rounded-[24px] my-5 ${className}`}
      style={{
        background: "#fdf8f1",
        border: "1px solid #e6dccd",
        boxShadow: "0 6px 20px rgba(58,47,40,0.07)"
      }}>
      
      {children}
    </div>);

}