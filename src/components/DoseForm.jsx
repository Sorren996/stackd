import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { X, Syringe, Droplets } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORY_ORDER = ["Rapid-Acting", "Short-Acting", "Intermediate", "Long-Acting", "Ultra Long-Acting"];

const groupedInsulins = CATEGORY_ORDER.reduce((acc, cat) => {
  const items = Object.entries(INSULIN_PROFILES).filter(([, p]) => p.category === cat);
  if (items.length) acc.push({ category: cat, items });
  return acc;
}, []);

const GLUCOSE_PRESETS = [70, 100, 120, 140, 180, 200, 250];

export default function DoseForm({ open, onOpenChange }) {
  const [tab, setTab] = useState("insulin");
  const [insulinType, setInsulinType] = useState("");
  const [units, setUnits] = useState(10);
  const [insulinNotes, setInsulinNotes] = useState("");
  const [insulinTime, setInsulinTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [glucoseValue, setGlucoseValue] = useState(100);
  const [glucoseNotes, setGlucoseNotes] = useState("");
  const [glucoseTime, setGlucoseTime] = useState(() => new Date().toTimeString().slice(0, 5));

  const nowTimeString = new Date().toTimeString().slice(0, 5);
  const queryClient = useQueryClient();

  const createDose = useMutation({
    mutationFn: (data) => base44.entities.InsulinDose.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose logged — tracking activity now");
      onOpenChange(false);
      setInsulinType(""); setUnits(10); setInsulinNotes("");
      setInsulinTime(new Date().toTimeString().slice(0, 5));
    }
  });

  const createGlucose = useMutation({
    mutationFn: (data) => base44.entities.GlucoseReading.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Glucose logged");
      onOpenChange(false);
      setGlucoseValue(100); setGlucoseNotes("");
      setGlucoseTime(new Date().toTimeString().slice(0, 5));
    }
  });

  const profile = insulinType ? INSULIN_PROFILES[insulinType] : null;
  const accentColor = profile?.color || "#2dd4bf";
  const glucoseColor = "#f97316";

  const handleSubmitInsulin = () => {
    if (!insulinType || !units) return;
    const [h, m] = insulinTime.split(":").map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    createDose.mutate({
      insulin_type: insulinType,
      units: parseFloat(units),
      administered_at: dt.toISOString(),
      notes: insulinNotes || undefined
    });
  };

  const handleSubmitGlucose = () => {
    if (!glucoseValue) return;
    const [h, m] = glucoseTime.split(":").map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    createGlucose.mutate({
      value: parseFloat(glucoseValue),
      recorded_at: dt.toISOString(),
      notes: glucoseNotes || undefined
    });
  };

  const adjust = (delta) => setUnits((u) => Math.max(0.5, Math.round((u + delta) * 2) / 2));
  const adjustGlucose = (delta) => setGlucoseValue((v) => Math.min(400, Math.max(40, v + delta)));
  const shortName = insulinType ? insulinType.split(" ")[0] : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
return (
  <AnimatePresence>
    {open && (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPortal forceMount>
          {/* Animated Backdrop */}
          <DialogOverlay asChild forceMount>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
              onClick={() => onOpenChange(false)}
            />
          </DialogOverlay>

          {/* Animated Sheet / Modal */}
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { type: "spring", stiffness: 280, damping: 28 }
            }}
            exit={{
              opacity: 0,
              y: "100%",
              transition: { duration: 0.22, ease: "easeInOut" }
            }}
            className="fixed bottom-0 sm:bottom-auto left-0 right-0 sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-50 w-full sm:max-w-md flex flex-col overflow-hidden rounded-t-[2rem] sm:rounded-3xl"
            style={{ background: "hsl(162,10%,8%)", maxHeight: "92vh" }}
          >
            {/* Header, Tabs, Form content... */}
          </motion.div>
        </DialogPortal>
      </Dialog>
    )}
  </AnimatePresence>
);
  );
}