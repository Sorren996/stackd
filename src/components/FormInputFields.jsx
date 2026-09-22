const GLASS_SURFACE = {
  background: "#fdf9f2",
  borderColor: "#eadccf",
  boxShadow: "none"
};

export function NumberPadField({ label, value, onChange, unit, placeholder = "--", decimal = true, maxLength = 6, large = false }) {
  const textValue = value === undefined || value === null ? "" : String(value);

  const handleChange = (e) => {
    const next = e.target.value;
    if (decimal ? !/^\d*\.?\d*$/.test(next) : !/^\d*$/.test(next)) return;
    onChange(next);
  };

  return (
    <div className={`stackd-input rounded-xl border p-3 ${large ? "px-6 py-6" : ""}`} style={GLASS_SURFACE}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#6b6153" }}>{label}</span>
        <div className="flex min-w-0 items-baseline gap-1">
          <input
            type="text"
            inputMode={decimal ? "decimal" : "numeric"}
            value={textValue}
            onChange={handleChange}
            placeholder={placeholder}
            maxLength={maxLength}
            className={`w-full min-w-0 bg-transparent text-right font-bold focus:outline-none ${large ? "text-5xl" : "text-base"}`}
            style={{ color: "#3f3830" }}
          />
          
          {unit && <span className="shrink-0 text-xs" style={{ color: "#6b6153" }}>{unit}</span>}
        </div>
      </div>
    </div>);

}

export function TextPadField({ label, value, onChange, placeholder, multiline = false }) {
  return (
    <div>
      {label && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#6b6153" }}>{label}</span>}
      {multiline ?
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-2xl border px-4 py-3.5 text-sm focus:outline-none"
        style={{ ...GLASS_SURFACE, color: "#3f3830" }} /> :


      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border px-4 py-3.5 text-left text-sm focus:outline-none"
        style={{ ...GLASS_SURFACE, color: "#3f3830" }} />

      }
    </div>);

}

export function DateScrollField({ label, value, onChange, max }) {
  return (
    <div className="stackd-input rounded-2xl border p-3" style={GLASS_SURFACE}>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "#6b6153" }}>{label}</span>
        <input
          type="date"
          value={value || ""}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent text-sm font-semibold focus:outline-none"
          style={{ color: "#3f3830" }} />
        
      </div>
    </div>);

}

export function TimeScrollField({ label, value, onChange, max }) {
  return (
    <div className="rounded-2xl border p-3 my-3" style={GLASS_SURFACE}>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "#6b6153" }}>{label}</span>
        <input
          type="time"
          value={value || ""}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="bg-transparent text-sm font-semibold focus:outline-none"
          style={{ color: "#3f3830" }} />
        
      </div>
    </div>);

}

export function SelectField({ label, value, onChange, options, placeholder = "Select" }) {
  return (
    <div className="stackd-input rounded-xl border p-3" style={GLASS_SURFACE}>
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#6b6153" }}>{label}</span>
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-right text-sm font-semibold focus:outline-none"
          style={{ color: "#3f3830" }}>
          
          {!value && <option value="">{placeholder}</option>}
          {options.map((option) =>
          <option key={option.value} value={option.value} style={{ background: "#fdf9f2", color: "#3f3830" }}>
              {option.label}
            </option>
          )}
        </select>
      </div>
    </div>);

}