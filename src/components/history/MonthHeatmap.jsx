import { format, parseISO, startOfWeek, addDays, isSameMonth } from "date-fns";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

function dayTir(day) {
  return day.glucose?.count ? Math.round((day.glucose.inRange / day.glucose.count) * 100) : null;
}

function tirColor(tir) {
  if (tir == null) return null;
  if (tir >= 80) return "#4d5742"; // sage — steady
  if (tir >= 60) return "#7d8a6e"; // lighter sage
  if (tir >= 40) return "#d58814ff"; // mustard — mixed
  return "#d33418ff"; // clay — hard
}

/**
 * MonthHeatmap — Oura-style calendar grid where each day cell is tinted by
 * time-in-range. Tappable cells open the day recap. Untracked days are faint.
 */
export default function MonthHeatmap({ days, onSelectDay }) {
  if (!days.length) {
    return <p className="py-8 text-center text-sm" style={{ color: "#746959" }}>No moments this month yet.</p>;
  }

  const byDate = {};
  days.forEach((d) => { byDate[d.date] = d; });

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const first = parseISO(sorted[0].date);
  const last = parseISO(sorted[sorted.length - 1].date);
  const gridStart = startOfWeek(first, { weekStartsOn: 1 });
  const endLimit = addDays(last, 7);

  const cells = [];
  let cur = new Date(gridStart);
  while (cur <= endLimit) {
    const key = format(cur, "yyyy-MM-dd");
    cells.push({ date: key, day: byDate[key] || null, inMonth: isSameMonth(cur, last) || isSameMonth(cur, first), dateObj: new Date(cur) });
    cur = addDays(cur, 1);
  }
  while (cells.length % 7 !== 0) cells.pop();

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {DOW.map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold" style={{ color: "#746959" }}>{d}</div>
        ))}
      </div>
      <div className="space-y-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1.5">
            {week.map((cell) => {
              const tracked = !!cell.day;
              const tir = tracked ? dayTir(cell.day) : null;
              const color = tracked ? tirColor(tir) : null;
              const dayNum = cell.dateObj.getDate();
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!tracked}
                  onClick={() => tracked && onSelectDay(cell.date)}
                  className="flex aspect-square items-center justify-center rounded-lg text-[9px] font-semibold transition active:scale-[0.96]"
                  style={{
                    background: color || (cell.inMonth ? "rgba(63,56,48,0.04)" : "transparent"),
                    color: tracked && tir != null ? "#fdf9f2" : "#746959",
                    opacity: tracked ? (tir != null ? 0.88 : 0.5) : cell.inMonth ? 0.55 : 0.25,
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-[9px] font-medium" style={{ color: "#746959" }}>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#4d5742" }} />Steady</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#d58814ff" }} />Mixed</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#d33418ff" }} />Hard</span>
      </div>
    </div>
  );
}