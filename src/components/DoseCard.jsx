import { INSULIN_PROFILES, getDoseStatus, formatMinutes } from "@/lib/insulinPharmacology";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function DoseCard({ dose, onDelete }) {
  const profile = INSULIN_PROFILES[dose.insulin_type];
  const status = getDoseStatus(dose);

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl transition-all">
      <div
        className="rounded-full shrink-0 w-2 h-2"
        style={{ backgroundColor: profile?.color || "#888888" }} />
      
      <div className="flex-1 min-w-0">
        <p className="text-[hsl(var(--card-foreground))] px-0 py-1 text-xs font-medium opacity-65 rounded-full opacity-65 rounded-full">{dose.insulin_type}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {dose.units} units · {format(new Date(dose.administered_at), "MMM d, h:mm a")}
        </p>
        {dose.notes && <p className="text-xs text-muted-foreground mt-1 italic">{dose.notes}</p>}
      </div>
      <div className="text-right shrink-0">
        <span className={`text-[hsl(var(--card-foreground))] px-2 py-1 text-xs font-medium opacity-65 rounded-full ${
        status.phase === "expired" ? "opacity-65 rounded-full" :
        status.phase === "waiting" ? "opacity-65 rounded-full" :
        status.phase === "rising" ? "opacity-65 rounded-full" :
        "opacity-65 rounded-full"}`}>
          {status.phase === "expired" ? "Done" : status.message.split("—")[0].trim()}
        </span>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[hsl(var(--popover))]">Delete this dose?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the {dose.units}u {dose.insulin_type} dose from your log and graph.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[hsl(var(--popover))]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(dose.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>);

}