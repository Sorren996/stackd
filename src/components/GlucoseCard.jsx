import { formatDistanceToNow, format } from "date-fns";
import { Trash2, Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";

export default function GlucoseCard({ reading, onDelete }) {
  const value = reading.value;
  const color = value < 70 ? "#3b82f6" : value > 180 ? "#f59e0b" : "#4ade80";
  const statusLabel = value < 70 ? "Below range" : value > 180 ? "Above range" : "In range";
  const timeAgo = formatDistanceToNow(new Date(reading.recorded_at), { addSuffix: true });

  const eventLabel = value < 70 ? "Low glucose detected" : value > 180 ? "Elevated glucose reading" : "Glucose reading logged";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3.5 px-4 py-3.5 rounded-2xl transition-all"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: `${color}20`, border: `1px solid ${color}50` }}>
          <Droplets className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div className="w-px flex-1 mt-2" style={{ background: `${color}25`, minHeight: 12 }} />
      </div>

      <div className="flex-1 min-w-0 pt-0.5 p-4">
        <p className="text-sm font-semibold text-white/85">{eventLabel}</p>
        <p className="text-xs text-white/35 mt-0.5">{timeAgo} · {format(new Date(reading.recorded_at), "h:mm a")}</p>
        <p className="text-xs mt-1.5 font-semibold" style={{ color }}>
          {value} mg/dL · {statusLabel}
        </p>
        {reading.notes && <p className="text-xs text-white/30 mt-1 italic">{reading.notes}</p>}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 w-7 h-7 text-white/20 hover:text-destructive hover:bg-destructive/10 mt-0.5">
            <Trash2 className="w-3.5 h-3.5" />
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
    </motion.div>
  );
}