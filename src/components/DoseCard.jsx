import { INSULIN_PROFILES, getDoseStatus, formatMinutes } from "@/lib/insulinPharmacology";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function DoseCard({ dose, onDelete }) {
  const profile = INSULIN_PROFILES[dose.insulin_type];
  const status = getDoseStatus(dose);

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-xl transition-all"
      style={{
        background: "rgba(255,255,255,0.03)",
        boxShadow: `0 0 18px 2px ${profile?.color || "#888888"}22, inset 0 1px 0 rgba(255,255,255,0.06)`
      }}>
      <div
        className="rounded-full shrink-0 w-2 h-2"
        style={{ backgroundColor: profile?.color || "#888888" }} />
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-white">{dose.insulin_type}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {dose.units} units · {format(new Date(dose.administered_at), "MMM d, h:mm a")}
        </p>
        {dose.notes && <p className="text-xs text-muted-foreground mt-1 italic">{dose.notes}</p>}
      </div>
      <div className="text-right shrink-0">
        <span className={`text-xs px-2 py-1 rounded-full font-medium text-[hsl(var(--card-foreground))] opacity-65 ${
        status.phase === "expired" ? "" :
        status.phase === "waiting" ? "" :
        status.phase === "rising" ? "" :
        ""}`}>
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