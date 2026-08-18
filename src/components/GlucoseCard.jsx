import { formatDistanceToNow, format } from "date-fns";
import { Trash2, Droplets, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import { getGlucoseColor, getGlucoseStatusLabel } from "@/lib/glucoseStatus";

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };
  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);
  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
}

export default function GlucoseCard({ reading, onDelete, locked = false }) {
  const value = reading.value;
  const { low, high } = readTargetRange();
  const color = getGlucoseColor(value, low, high);
  const statusLabel = getGlucoseStatusLabel(value, low, high);
  const timeAgo = formatDistanceToNow(new Date(reading.recorded_at), { addSuffix: true });

  const eventLabel = value < low ? "Glucose below comfort zone" : value > high ? "Glucose above comfort zone" : "Glucose check-in";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3.5 px-4 py-3.5 backdrop-blur-sm rounded-2xl transition-all p-4"
      style={{
        background: `linear-gradient(to right, ${color}12, transparent 55%)`,
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderLeft: `2.5px solid ${color}50`,
        boxShadow: "0 6px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
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

      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-white/85">{eventLabel}</p>
        <p className="text-xs text-white/70 mt-0.5">{timeAgo} · {format(new Date(reading.recorded_at), "h:mm a")}</p>
        <p className="text-xs mt-1.5 font-semibold" style={{ color }}>
          {value} mg/dL · {statusLabel}
        </p>
        {reading.notes && <p className="text-xs text-white/30 mt-1 italic">{reading.notes}</p>}
        {locked && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-white/30">
            <Lock className="w-3 h-3" /> Archived
          </p>
        )}
      </div>

      {!locked && (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 w-7 h-7 text-white/50 hover:text-destructive hover:bg-destructive/10 mt-0.5">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[hsl(var(--popover))]">Remove this check-in?</AlertDialogTitle>
            <AlertDialogDescription>
              This will gently remove the {value} mg/dL reading from your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-[hsl(var(--popover))]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(reading.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </motion.div>
  );
}