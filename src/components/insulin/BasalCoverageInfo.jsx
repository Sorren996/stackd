import InfoPopover from "@/components/graph/InfoPopover";

/**
 * Plain-language explanation of basal coverage, shown when the user taps
 * the info icon on the IOB card's basal section. Intentionally avoids all
 * pharmacokinetic jargon — the complexity lives in the model, not here.
 */
export default function BasalCoverageInfo({ anchorRect, onClose, insulinType }) {
  const isTresiba = insulinType && /tresiba|degludec/i.test(insulinType);

  return (
    <InfoPopover anchorRect={anchorRect} onClose={onClose}>
      <p className="text-[11px] font-semibold text-white/85">What is basal coverage?</p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-white/55">
        Basal insulin works quietly in the background throughout the day and night.
        Long-acting insulin can continue contributing after your next dose is taken,
        so STACKD shows overlapping coverage instead of treating each dose as a
        24-hour timer.
      </p>
      {isTresiba && (
        <p className="mt-2 text-[10px] leading-relaxed text-white/55">
          Tresiba has a very long and flat activity profile. Your doses overlap,
          helping provide continuous background insulin coverage.
        </p>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-white/45">
        This is a modeled estimate, not a measurement of insulin in your body.
      </p>
    </InfoPopover>
  );
}