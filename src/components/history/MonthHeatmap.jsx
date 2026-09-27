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
 * time-in-range. The grid is built from the 1st of the month (not from the
 * first tracked day), so every day of the month is visible with leading
 * padding before day 1. Tappable cells open the day recap. Today is
 * highlighted with a copper ring. Untracked days are faint.
 */
export default function MonthHeatmap({ days, onSelectDay }) {
  if (!days.length) {
    return <p className="py-8 text-center text-sm" style={{ color: "#746959" }}>No moments this month yet.</p>;
  }

  const byDate = {};
  days.forEach((d) => { byDate[d.date] = d; });

  // Derive the month/year from the first tracked day, then build the grid
  // from the 1st of that month so days 1 through end-of-month are all shown.
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const refDate = parseISO(sorted[0].date);
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = startOfWeek(firstOfMonth, { weekStartsOn: 1 });
  const endLimit = addDays(lastOfMonth, 7);

  const todayKey = format(new Date(), "yyyy-MM-dd");

  const cells = [];
  let cur = new Date(gridStart);
  while (cur <= endLimit) {
    const key = format(cur, "yyyy-MM-dd");
    cells.push({
      date: key,
      day: byDate[key] || null,
      inMonth: isSameMonth(cur, firstOfMonth),
      dateObj: new Date(cur),
      isToday: key === todayKey,
    });
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
                  className="relative flex aspect-square items-center justify-center rounded-lg text-[9px] font-semibold transition active:scale-[0.96]"
                  style={{
                    background: color || (cell.inMonth ? "rgba(63,56,48,0.04)" : "transparent"),
                    color: tracked && tir != null ? "#fdf9f2" : "#746959",
                    opacity: tracked ? (tir != null ? 0.88 : 0.5) : cell.inMonth ? 0.55 : 0.25,
                    boxShadow: cell.isToday ? "inset 0 0 0 1.5px #9c5228" : undefined,
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