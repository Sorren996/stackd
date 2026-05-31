import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import DoseCard from "../components/DoseCard";
import { toast } from "sonner";
import { CalendarDays } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";

function groupByDate(doses) {
  const groups = {};
  doses.forEach((dose) => {
    const date = format(parseISO(dose.administered_at), "yyyy-MM-dd");
    if (!groups[date]) groups[date] = [];
    groups[date].push(dose);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const d = parseISO(date);
      let label = format(d, "EEEE, MMMM d");
      if (isToday(d)) label = "Today";
      else if (isYesterday(d)) label = "Yesterday";
      return { date, label, items };
    });
}

export default function History() {
  const queryClient = useQueryClient();

  const { data: doses = [], isLoading } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 200),
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose removed");
    },
  });

  const groups = groupByDate(doses);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dose History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All your logged insulin doses, organized by date
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-semibold">No doses logged yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Head to the Dashboard to log your first dose.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.date} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {group.label}
            </h3>
            {group.items.map((dose) => (
              <DoseCard
                key={dose.id}
                dose={dose}
                onDelete={(id) => deleteDose.mutate(id)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}