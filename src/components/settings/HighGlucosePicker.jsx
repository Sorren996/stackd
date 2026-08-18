import { useRef, useEffect, useState, useCallback } from "react";
import { getHighReferenceOptions } from "@/lib/glucoseStatus";

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const PADDING = (PICKER_HEIGHT - ITEM_HEIGHT) / 2;
const OPTIONS = getHighReferenceOptions();

// iOS-style vertical wheel selector for the configurable High glucose
// reference. Uses native CSS scroll-snap for smooth, touch-friendly snapping
// to valid 10 mg/dL increments. The selected value is centered and emphasized;
// neighbors fade out. Settling on a new value calls onChange (autosave).
export default function HighGlucosePicker({ value, onChange }) {
  const listRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const [centeredIndex, setCenteredIndex] = useState(() => {
    const i = OPTIONS.indexOf(value);
    return i >= 0 ? i : OPTIONS.indexOf(250);
  });

  // Sync scroll position when the value changes externally.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const index = OPTIONS.indexOf(value);
    if (index < 0) return;
    const targetScroll = index * ITEM_HEIGHT;
    if (Math.abs(list.scrollTop - targetScroll) > 1) {
      list.scrollTop = targetScroll;
    }
    setCenteredIndex(index);
  }, [value]);

  const handleScroll = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const newIndex = Math.max(0, Math.min(OPTIONS.length - 1, Math.round(list.scrollTop / ITEM_HEIGHT)));
    setCenteredIndex((prev) => (prev !== newIndex ? newIndex : prev));

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const targetScroll = newIndex * ITEM_HEIGHT;
      if (Math.abs(list.scrollTop - targetScroll) > 1) {
        list.scrollTo({ top: targetScroll, behavior: "smooth" });
      }
      const newValue = OPTIONS[newIndex];
      if (newValue !== value) {
        onChange(newValue);
      }
    }, 130);
  }, [value, onChange]);

  useEffect(() => () => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  }, []);

  return (
    <div className="relative select-none" style={{ height: PICKER_HEIGHT }}>
      {/* Center highlight band */}
      <div
        className="pointer-events-none absolute left-3 right-3 z-10 rounded-2xl border border-amber-400/25"
        style={{
          top: PADDING,
          height: ITEM_HEIGHT,
          background: "linear-gradient(90deg, rgba(212,160,86,0.10), rgba(212,160,86,0.04), rgba(212,160,86,0.10))",
        }}
      />
      {/* Top fade mask */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10"
        style={{ height: PADDING, background: "linear-gradient(to bottom, rgba(21,29,30,0.94), transparent)" }}
      />
      {/* Bottom fade mask */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{ height: PADDING, background: "linear-gradient(to top, rgba(21,29,30,0.94), transparent)" }}
      />

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="no-scrollbar h-full overflow-y-auto"
        style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}
      >
        <div style={{ height: PADDING }} />
        {OPTIONS.map((v, i) => {
          const distance = Math.abs(i - centeredIndex);
          const isSelected = distance === 0;
          return (
            <div
              key={v}
              className="flex items-center justify-center"
              style={{ height: ITEM_HEIGHT, scrollSnapAlign: "center" }}
            >
              <span
                className="tabular-nums transition-all duration-150"
                style={{
                  fontSize: isSelected ? 22 : 18,
                  fontWeight: isSelected ? 800 : 600,
                  color: isSelected ? "#fde68a" : `rgba(255,255,255,${Math.max(0.14, 0.5 - distance * 0.12)})`,
                  transform: `scale(${isSelected ? 1 : Math.max(0.82, 0.92 - distance * 0.05)})`,
                }}
              >
                {v}
              </span>
            </div>
          );
        })}
        <div style={{ height: PADDING }} />
      </div>
    </div>
  );
}