import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * The public questions, answered plainly.
 *
 * A real button per question with aria-expanded and aria-controls, so it works
 * from the keyboard and reads correctly to a screen reader. Each answer can be
 * opened independently.
 */
export default function FaqList({ items }) {
  const [open, setOpen] = useState(null);

  return (
    <div className="divide-y" style={{ borderColor: "#eadccf" }}>
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.q} className="py-1">
            <h3>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : index)}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
                id={`faq-trigger-${index}`}
                className="flex w-full items-center justify-between gap-4 rounded-2xl py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9c5228] focus-visible:ring-offset-2"
              >
                <span className="text-[15px] font-semibold leading-snug text-ink">{item.q}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-5 w-5 shrink-0 text-ink-muted transition-transform duration-300 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
            </h3>
            <div
              id={`faq-panel-${index}`}
              role="region"
              aria-labelledby={`faq-trigger-${index}`}
              hidden={!isOpen}
              className="pb-4 pr-8"
            >
              <p className="text-sm leading-relaxed text-ink-muted">{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}