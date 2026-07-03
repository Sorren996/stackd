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
  const statusLabel = value < 70 ? "Gently Descending" : value > 180 ? "Ascending" : "In Flow";
  const timeAgo = formatDistanceToNow(new Date(reading.recorded_at), { addSuffix: true });

  const eventLabel = value < 70 ? "A gentle dip noticed" : value > 180 ? "A gentle rise noticed" : "Reading captured";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex items-start gap-3.5 overflow-hidden px-4 py-3.5 rounded-2xl transition-all p-4"
      style={{
        background: `linear-gradient(to right, ${color}22, transparent 60%), radial-gradient(circle at 8% 50%, ${color}18, transparent 45%)`,
        border: "none",
        borderLeft: `3px solid ${color}80`,
        boxShadow: `0 4px 20px ${color}15, inset 0 1px 1px rgba(255,255,255,0.08)`,
      }}
    >
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <motion.div
          animate={{ boxShadow: [`0 0 0px ${color}00`, `0 0 16px ${color}66`, `0 0 0px ${color}00`] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: `${color}25`, border: `1px solid ${color}60` }}>
          <Droplets className="w-3.5 h-3.5" style={{ color }} />
        </motion.div>
        <div className="w-px flex-1 mt-2" style={{ background: `${color}40`, minHeight: 12 }} />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
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
            <AlertDialogTitle className="text-[hsl(var(--popover))]">Remove this reading?</AlertDialogTitle>
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