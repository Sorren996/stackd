const GLASS_SURFACE = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))",
  borderColor: "rgba(255,255,255,0.14)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.1)",
};

export function NumberPadField({ label, value, onChange, unit, placeholder = "--", decimal = true, maxLength = 6, large = false }) {
  const textValue = value === undefined || value === null ? "" : String(value);

  const handleChange = (e) => {
    const next = e.target.value;
    if (decimal ? !/^\d*\.?\d*$/.test(next) : !/^\d*$/.test(next)) return;
    onChange(next);
  };

  return (
    <div className={`rounded-xl border p-3 ${large ? "px-6 py-6" : ""}`} style={GLASS_SURFACE}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
        <div className="flex min-w-0 items-baseline gap-1">
          <input
            type="text"
            inputMode={decimal ? "decimal" : "numeric"}
            value={textValue}
            onChange={handleChange}
            placeholder={placeholder}
            maxLength={maxLength}
            className={`w-full min-w-0 bg-transparent text-right font-bold text-white placeholder:text-white/30 focus:outline-none ${large ? "text-5xl" : "text-base"}`}
          />
          {unit && <span className="shrink-0 text-xs text-white/55">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

export function TextPadField({ label, value, onChange, placeholder, multiline = false }) {
  return (
    <div>
      {label && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</span>}
      {multiline ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none rounded-2xl border px-4 py-3.5 text-sm text-white placeholder:text-white/50 focus:outline-none"
          style={GLASS_SURFACE}
        />
      ) : (
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl border px-4 py-3.5 text-left text-sm text-white placeholder:text-white/50 focus:outline-none"
          style={GLASS_SURFACE}
        />
      )}
    </div>
  );
}

export function DateScrollField({ label, value, onChange, max }) {
  return (
    <div className="rounded-2xl border p-3" style={GLASS_SURFACE}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">{label}</span>
        <input
          type="date"
          value={value || ""}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent text-sm font-semibold text-white focus:outline-none [color-scheme:dark]"
        />
      </div>
    </div>
  );
}

export function TimeScrollField({ label, value, onChange, max }) {
  return (
    <div className="rounded-2xl border p-3" style={GLASS_SURFACE}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">{label}</span>
        <input
          type="time"
          value={value || ""}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent text-sm font-semibold text-white focus:outline-none [color-scheme:dark]"
        />
      </div>
    </div>
  );
}

export function SelectField({ label, value, onChange, options, placeholder = "Select" }) {
  return (
    <div className="rounded-xl border p-3" style={GLASS_SURFACE}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold text-white focus:outline-none [color-scheme:dark]"
        >
          {!value && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-[hsl(162,10%,9%)] text-white">
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}