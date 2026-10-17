import { useState, useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { COPPER, FAINT } from "@/components/forms/FieldKit";

/**
 * Optional AI meal estimate from a photo. Sends ONLY the image — never
 * glucose, doses, settings, or identity. Fills the meal name, carbs, and
 * protein/fat levels as a starting point the user can freely adjust.
 *
 * On mobile, `capture="environment"` opens the rear camera in the iOS
 * Safari PWA. On desktop, it falls back to a standard file picker.
 */
export default function MealPhotoChip({ onEstimate }) {
  const [loading, setLoading] = useState(false);
  const [estimated, setEstimated] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setLoading(true);
    try {
      // Upload the photo privately — no public URL, access follows the app's permissions.
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const res = await base44.functions.invoke("estimateMealPhoto", { file_uri });
      onEstimate(res.data);
      setEstimated(true);
    } catch (error) {
      toast.error(
        error?.response?.data?.error ||
          "Could not estimate this meal. You can still enter carbs yourself."
      );
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
        style={{ background: "rgba(156,82,40,0.12)", color: COPPER }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {loading ? "Estimating..." : "Estimate from photo"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <span className="text-xs" style={{ color: FAINT }}>
        {estimated ? "A starting point. Adjust it to fit your meal." : "Optional · only the photo is shared"}
      </span>
    </div>
  );
}