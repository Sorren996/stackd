import DashboardCard from "@/components/dashboard/DashboardCard";

/**
 * One cream reading surface in the Insights stack: a small section title,
 * an optional one-line helper, then the content. No nested tiles.
 */
export default function InsightSection({ title, helper, children, label }) {
  return (
    <DashboardCard className="p-[18px]">
      <section aria-label={label || title}>
        {title && (
          <h2 className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
            {title}
          </h2>
        )}
        {helper && (
          <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "#6b6153" }}>
            {helper}
          </p>
        )}
        <div className={title || helper ? "pt-3" : ""}>{children}</div>
      </section>
    </DashboardCard>
  );
}