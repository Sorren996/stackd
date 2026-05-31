import { INSULIN_PROFILES, getDoseStatus, formatMinutes } from "@/lib/insulinPharmacology";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function DoseCard({ dose, onDelete }) {
  const profile = INSULIN_PROFILES[dose.insulin_type];
  const status = getDoseStatus(dose);

  return (
    <div className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-md transition-all">
      <div
        className="w-3 h-12 rounded-full shrink-0"
        style={{ backgroundColor: profile?.color || "#888" }} />
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-white">{dose.insulin_type}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {dose.units} units · {format(new Date(dose.administered_at), "MMM d, h:mm a")}
        </p>
        {dose.notes && <p className="text-xs text-muted-foreground mt-1 italic">{dose.notes}</p>}
      </div>
      <div className="text-right shrink-0">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
        status.phase === "expired" ? "bg-muted text-muted-foreground" :
        status.phase === "waiting" ? "bg-amber-100 text-amber-700" :
        status.phase === "rising" ? "bg-blue-100 text-blue-700" :
        "bg-emerald-100 text-emerald-700"}`
        }>
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
            <AlertDialogTitle>Delete this dose?</AlertDialogTitle>
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