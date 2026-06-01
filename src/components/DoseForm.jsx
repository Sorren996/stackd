import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Syringe } from "lucide-react";
import { toast } from "sonner";

export default function DoseForm({ fullWidth }) {
  const [open, setOpen] = useState(false);
  const [insulinType, setInsulinType] = useState("");
  const [units, setUnits] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const createDose = useMutation({
    mutationFn: (data) => base44.entities.InsulinDose.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose logged — tracking activity now");
      setOpen(false);
      setInsulinType("");
      setUnits("");
      setNotes("");
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!insulinType || !units) return;
    createDose.mutate({
      insulin_type: insulinType,
      units: parseFloat(units),
      administered_at: new Date().toISOString(),
      notes: notes || undefined
    });
  };

  const profile = insulinType ? INSULIN_PROFILES[insulinType] : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className={`gap-2 shadow-lg shadow-primary/20 bg-[#1b887d]${fullWidth ? " w-full sm:w-auto" : ""}`}>
          <Plus className="w-5 h-5" />
          Log Dose
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[hsl(var(--popover))]">Log Insulin Dose


          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 pt-2 text-[hsl(var(--popover))]">
          <div className="space-y-2">
            <Label>Insulin Type</Label>
            <Select value={insulinType} onValueChange={setInsulinType}>
              <SelectTrigger className="text-[hsl(var(--popover))]">
                <SelectValue placeholder="Select insulin type" className="text-[hsl(var(--muted-foreground))]" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INSULIN_PROFILES).map(([name, p]) =>
                <SelectItem key={name} value={name}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span>{name}</span>
                      <span className="text-xs text-muted-foreground ml-1">({p.category})</span>
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Units</Label>
            <Input
              type="number"
              min="0.5"
              step="0.5"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="e.g. 20"
              className="text-lg" />
            
          </div>

          {profile &&
          <div className="bg-muted rounded-xl p-4 space-y-2 text-sm">
              <p className="font-medium text-foreground">{profile.category}</p>
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <span>Onset: {profile.onsetMin}–{profile.onsetMax} min</span>
                <span>
                  Peak: {profile.peakMin ? `${Math.round(profile.peakMin / 60)}–${Math.round(profile.peakMax / 60)} hr` : "Peakless"}
                </span>
                <span>Duration: {Math.round(profile.durationMin / 60)}–{Math.round(profile.durationMax / 60)} hr</span>
              </div>
            </div>
          }

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pre-meal, correction, etc."
              rows={2} />
            
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={!insulinType || !units || createDose.isPending}>
            
            {createDose.isPending ? "Logging..." : "Log Dose"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>);

}