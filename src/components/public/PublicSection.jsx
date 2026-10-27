import { cn } from "@/lib/utils";

const TONES = {
  // The slate field the site opens on. Eyebrows use the mist tone (4.72:1) and
  // body copy inside a tinted panel uses the cream tone, never the mist one.
  field: { className: "bg-field text-field-ink", eyebrow: "#dde5e8", title: "#fdf9f2", lede: "#dde5e8" },
  // A cream reading surface, for sections that carry a lot of detail.
  paper: { className: "bg-paper text-ink", eyebrow: "#746959", title: "#3f3830", lede: "#6b6153" },
  sunk: { className: "bg-paper-sunk text-ink", eyebrow: "#746959", title: "#3f3830", lede: "#6b6153" },
};

/**
 * One scene of a public page: an optional heading block, then whatever the
 * section composes. Tone alternates between the slate field and cream reading
 * surfaces so long pages stay readable without turning into rows of cards.
 */
export default function PublicSection({
  id,
  tone = "field",
  eyebrow,
  title,
  lede,
  aside,
  width = "wide",
  className,
  children,
}) {
  const t = TONES[tone] ?? TONES.field;
  return (
    <section id={id} className={cn("scroll-mt-20 px-4 py-14 sm:px-8 sm:py-24", t.className, className)}>
      <div className={cn("mx-auto w-full", width === "narrow" ? "max-w-3xl" : "max-w-6xl")}>
        {(eyebrow || title || lede) && (
          <div className={cn("max-w-3xl", aside && "lg:flex lg:max-w-none lg:items-end lg:justify-between lg:gap-12")}>
            <div className="max-w-3xl">
              {eyebrow && (
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: t.eyebrow }}>
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2
                  className="mt-3 text-[26px] font-bold leading-[1.15] tracking-tight sm:text-4xl lg:text-[42px]"
                  style={{ color: t.title }}
                >
                  {title}
                </h2>
              )}
              {lede && (
                <p className="mt-4 text-[15px] leading-relaxed sm:text-base" style={{ color: t.lede }}>
                  {lede}
                </p>
              )}
            </div>
            {aside && <div className="mt-6 lg:mt-0 lg:shrink-0">{aside}</div>}
          </div>
        )}
        {children && <div className={cn((eyebrow || title || lede) && "mt-10 sm:mt-14")}>{children}</div>}
      </div>
    </section>
  );
}