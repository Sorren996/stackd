import DashboardCard from "@/components/dashboard/DashboardCard";

/**
 * Editorial section card: sandstone elevated surface (DashboardCard —
 * rounded corners, drop shadow, no border) with an optional small-caps
 * section-label header. Groups page content into logical cards on the
 * teal canvas so all text sits on sandstone with verified contrast.
 */
export default function SectionCard({ label, title, children, className = "" }) {
  return (
    <DashboardCard className={`p-5 ${className}`}>
      {label && <div className="section-label">{label}</div>}
      {title && (
        <h2 className={`text-base font-semibold ${label ? "mt-2" : ""}`} style={{ color: "#3f3830" }}>
          {title}
        </h2>
      )}
      <div className={label || title ? "pt-3" : ""}>{children}</div>
    </DashboardCard>
  );
}