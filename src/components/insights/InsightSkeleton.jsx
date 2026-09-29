import DashboardCard from "@/components/dashboard/DashboardCard";

export default function InsightSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <DashboardCard className="p-5">
        <div className="h-3 w-24 rounded bg-black/[0.06]" />
        <div className="mt-4 h-9 w-full rounded-lg bg-black/[0.06]" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-40 rounded bg-black/[0.06]" />
          <div className="h-3 w-52 rounded bg-black/[0.06]" />
          <div className="h-3 w-36 rounded bg-black/[0.06]" />
        </div>
      </DashboardCard>
      <DashboardCard className="p-5">
        <div className="h-3 w-28 rounded bg-black/[0.06]" />
        <div className="mt-4 h-3 w-full rounded bg-black/[0.06]" />
        <div className="mt-2 h-3 w-4/5 rounded bg-black/[0.06]" />
      </DashboardCard>
      <DashboardCard className="p-5">
        <div className="h-3 w-24 rounded bg-black/[0.06]" />
        <div className="mt-4 h-3 w-3/4 rounded bg-black/[0.06]" />
      </DashboardCard>
    </div>
  );
}