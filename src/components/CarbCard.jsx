import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PROFILE_COLORS } from "@/lib/carbAbsorption";

const PROFILE_LABELS = { fast: "Fast", medium: "Medium", slow: "Slow" };

export default function CarbCard({ entry, onDelete }) {
  const color = entry.is_custom
    ? "#6b7280"
    : (PROFILE_COLORS[entry.absorption_profile] || "#f59e0b");

  const profileLabel = entry.is_custom
    ? "Custom"
    : (PROFILE_LABELS[entry.absorption_profile] || "");

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl transition-all">
      <div className="rounded-full shrink-0 w-2 h-2" style={{ backgroundColor: color }} />

      <div className="flex-1 min-w-0">
        <p className="text-[hsl(var(--card-foreground))] px-0 py-1 text-sm font-medium opacity-65">
          {entry.food_name}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {entry.carbs}g carbs · {format(new Date(entry.consumed_at), "MMM d, h:mm a")}
        </p>
      </div>

      <div className="text-right shrink-0">
        <span className="text-sm font-medium opacity-65" style={{ color }}>
          {profileLabel}
        </span>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:bg-zinc-800 hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[hsl(var(--popover))]">Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the {entry.carbs}g {entry.food_name} entry from your log and graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[hsl(var(--popover))]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}