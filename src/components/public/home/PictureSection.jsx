import PublicSection from "@/components/public/PublicSection";
import HistoryPreview from "@/components/public/previews/HistoryPreview";

/**
 * The longer view. Only the views that exist in the app today are shown here:
 * the journal and day detail, and the range views for a window you choose.
 */
export default function PictureSection() {
  return (
    <PublicSection
      id="bigger-picture"
      tone="field"
      eyebrow="The bigger picture"
      title="Look back without the guesswork."
      lede="Single days are useful. Weeks and months are where the patterns live, and they are hard to hold in your head."
    >
      <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div className="order-2 lg:order-1">
          <ul className="space-y-6">
            <li>
              <h3 className="text-[15px] font-semibold text-field-ink">A journal, not a spreadsheet</h3>
              <p className="mt-1 text-sm leading-relaxed text-field-muted">
                Move through days and months, open any date and read it in full: readings, doses, meals and the notes you
                wrote at the time.
              </p>
            </li>
            <li>
              <h3 className="text-[15px] font-semibold text-field-ink">Views for a window you choose</h3>
              <p className="mt-1 text-sm leading-relaxed text-field-muted">
                Averages, time in range and daily balance over 30, 90 or 180 days of your own data, so a difficult week
                sits in context rather than on its own.
              </p>
            </li>
            <li>
              <h3 className="text-[15px] font-semibold text-field-ink">Enough data, or an honest blank</h3>
              <p className="mt-1 text-sm leading-relaxed text-field-muted">
                When there is not enough logged yet to say something useful, Stackd says so instead of drawing a
                confident line through a gap.
              </p>
            </li>
          </ul>
        </div>
        <div className="order-1 lg:order-2">
          <HistoryPreview />
        </div>
      </div>
    </PublicSection>
  );
}