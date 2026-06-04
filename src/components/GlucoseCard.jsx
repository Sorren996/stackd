import { format } from "date-fns";
import { Trash2, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";

export default function GlucoseCard({ reading, onDelete }) {
  const value = reading.value;
  const color = value < 70 ? "#ef4444" : value > 180 ? "#f97316" : "#4ade80";
  const statusLabel = value < 70 ? "Low" : value > 180 ? "High" : "In Range";

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl transition-all">
      <div className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />

      <div className="flex-1 min-w-0">
        <p className="text-[hsl(var(--card-foreground))] px-0 py-1 text-xs font-medium opacity-65 rounded-full">
          Glucose · <span style={{ color }}>{value} mg/dL</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {format(new Date(reading.recorded_at), "MMM d, h:mm a")}
        </p>
        {reading.notes && <p className="text-xs text-muted-foreground mt-1 italic">{reading.notes}</p>}
      </div>

      <div className="text-right shrink-0">
        <span className="text-[hsl(var(--card-foreground))] px-2 py-1 text-xs font-medium opacity-65 rounded-full">
          {statusLabel}
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
            <AlertDialogTitle className="text-[hsl(var(--popover))]">Delete this reading?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the {value} mg/dL glucose reading from your history and graphs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[hsl(var(--popover))]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(reading.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}