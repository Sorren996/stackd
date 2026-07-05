import { formatDistanceToNow, format } from "date-fns";
import { Trash2, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PROFILE_COLORS } from "@/lib/carbAbsorption";
import { motion } from "framer-motion";

const PROFILE_LABELS = { fast: "fast carbs", medium: "medium carbs", slow: "slow carbs" };

export default function CarbCard({ entry, onDelete }) {
  const color = entry.is_custom ? "#8b8b97" : (PROFILE_COLORS[entry.absorption_profile] || "#d4a056");
  const profileLabel = entry.is_custom ? "custom" : (PROFILE_LABELS[entry.absorption_profile] || "");
  const timeAgo = formatDistanceToNow(new Date(entry.consumed_at), { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start backdrop-blur-sm gap-3.5 px-4 py-3.5 rounded-2xl transition-all"
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
        {entry.is_high_protein_fat_meal && (
          <p className="mt-1 text-[10px] font-medium text-amber-400/60">High protein/fat monitoring selected</p>
        )}
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
            <AlertDialogTitle className="text-[hsl(var(--popover))]">Remove this nourishment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will gently remove the {entry.carbs}g {entry.food_name} from your log.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel className="text-[hsl(var(--popover))]">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(entry.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}