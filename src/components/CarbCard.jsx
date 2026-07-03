import { formatDistanceToNow, format } from "date-fns";
import { Trash2, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PROFILE_COLORS } from "@/lib/carbAbsorption";
import { motion } from "framer-motion";

const PROFILE_LABELS = { fast: "fast carbs", medium: "medium carbs", slow: "slow carbs" };

export default function CarbCard({ entry, onDelete }) {
  const color = entry.is_custom ? "#6b7280" : (PROFILE_COLORS[entry.absorption_profile] || "#f59e0b");
  const profileLabel = entry.is_custom ? "custom" : (PROFILE_LABELS[entry.absorption_profile] || "");
  const timeAgo = formatDistanceToNow(new Date(entry.consumed_at), { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex items-start gap-3.5 overflow-hidden px-4 py-3.5 rounded-2xl transition-all"
      style={{
        background: `linear-gradient(to right, ${color}15, transparent 55%), radial-gradient(circle at 10% 50%, ${color}0a, transparent 50%)`,
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderLeft: `2.5px solid ${color}50`,
        boxShadow: `0 2px 12px ${color}08, inset 0 1px 1px rgba(255,255,255,0.04)`,
      }}
    >
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: `${color}20`, border: `1px solid ${color}50` }}>
          <Wheat className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div className="w-px flex-1 mt-2" style={{ background: `${color}25`, minHeight: 12 }} />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-white/85">{entry.food_name} enjoyed</p>
        <p className="text-xs text-white/35 mt-0.5">{timeAgo} · {format(new Date(entry.consumed_at), "h:mm a")}</p>
        <p className="text-xs mt-1.5 font-medium" style={{ color }}>
          {entry.carbs}g {profileLabel}
        </p>
        {entry.notes && <p className="text-xs text-white/30 mt-1 italic">{entry.notes}</p>}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 w-7 h-7 text-white/20 hover:text-destructive hover:bg-destructive/10 mt-0.5">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[hsl(var(--popover))]">Remove this entry?</AlertDialogTitle>
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
    </motion.div>
  );
}