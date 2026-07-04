import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { LEGAL_DOCUMENTS } from "@/lib/acknowledgmentConfig";

export default function DocumentModal({ docKey, onClose }) {
  if (!docKey || typeof document === "undefined") return null;

  const doc = LEGAL_DOCUMENTS[docKey];
  if (!doc) return null;

  const paragraphs = doc.content.split("\n\n");

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex flex-col"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      >
        <div
          className="flex items-center justify-between border-b border-white/10 px-5 py-4 pt-[max(env(safe-area-inset-top),1rem)]"
          style={{ background: "linear-gradient(160deg, hsl(162,12%,9%), hsl(162,10%,6%))" }}
        >
          <div>
            <h2 className="text-base font-bold text-white">{doc.title}</h2>
            <p className="text-[10px] uppercase tracking-wider text-white/35">Version {doc.version}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto px-5 py-5 pb-[max(env(safe-area-inset-bottom),2rem)]"
          style={{ scrollbarWidth: "thin" }}
        >
          <div className="mx-auto max-w-md space-y-4">
            {paragraphs.map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-white/65 whitespace-pre-line">
                {para}
              </p>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]" style={{ background: "linear-gradient(160deg, hsl(162,12%,9%), hsl(162,10%,6%))" }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition active:scale-[0.99]"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
              boxShadow: "0 8px 24px rgba(91,163,184,0.18), inset 0 1px 1px rgba(255,255,255,0.2)",
            }}
          >
            I have read this document
          </button>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}