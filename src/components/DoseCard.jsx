import { INSULIN_PROFILES, getDoseStatus } from "@/lib/insulinPharmacology";
import { formatDistanceToNow, format } from "date-fns";
import { Trash2, Syringe, Pencil } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";

export default function DoseCard({ dose, onDelete, onEdit }) {
  const profile = INSULIN_PROFILES[dose.insulin_type];
  const status = getDoseStatus(dose);
  const color = profile?.color || "#b3b3b3ff";
  const isExpired = status.phase === "expired";
  const shortName = dose.insulin_type.split(" ")[0];
  const timeAgo = formatDistanceToNow(new Date(dose.administered_at), {
    addSuffix: true,
  });

  const statusText = isExpired
    ? "Support complete"
    : status.phase === "waiting"
      ? "Gently beginning"
      : status.phase === "rising"
        ? "Gently building"
        : status.phase === "active"
          ? "Providing steady support"
          : "Gently easing";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3.5 rounded-2xl px-4 py-3.5 transition-all"
      style={{
        background: `linear-gradient(to right, ${color}12, transparent 55%)`,
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderLeft: `2.5px solid ${color}50`,
        boxShadow: "0 6px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
      }}
    >



<div className="flex flex-col items-center pt-1 shrink-0">
  <div
    className="w-7 h-7 rounded-full flex items-center justify-center bg-blue-500/20"
   style={{  border: `1px solid ${color}` }}>
  
    <Syringe className="w-3.5 h-3.5" style={{ color }} />
  </div>

        <div className="w-px flex-1 mt-2" style={{ background: `${color}`, minHeight: 12 }} />

</div>

      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-semibold text-white/85">
          {dose.units}u {shortName} logged
        </p>

        <p className="mt-0.5 text-xs text-white/35">
          {timeAgo} · {format(new Date(dose.administered_at), "h:mm a")}
        </p>

        <p
          className="mt-1.5 text-xs font-medium"
          style={{ color: isExpired ? "rgba(255, 255, 255, 0)" : color }}
        >
          {statusText}
        </p>

        {dose.notes && (
          <p className="mt-1 text-xs italic text-white/30">{dose.notes}</p>
        )}
      </div>

      <div className="mt-0.5 flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onEdit?.(dose)}
          className="h-7 w-7 text-white/25 hover:bg-white/10 hover:text-white/80"
        >
        
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/20 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[hsl(var(--popover))]">
                Remove this support?
              </AlertDialogTitle>

              <AlertDialogDescription>
                This will gently remove the {dose.units}u {dose.insulin_type} from your log.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel className="text-[hsl(var(--popover))]">
                Cancel
              </AlertDialogCancel>

              <AlertDialogAction
                onClick={() => onDelete(dose.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </motion.div>
  );
}