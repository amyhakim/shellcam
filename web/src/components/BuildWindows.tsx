import { monthNum, monthYear, shortName } from "../data/format";
import type { Pair, Project } from "../data/types";

const TODAY = "2026-09";

/** Two-bar Gantt: each project's build window, the shared months highlighted. */
export default function BuildWindows({ pair, a, b, light = false }: { pair: Pair; a: Project; b: Project; light?: boolean }) {
  const starts = [a.window[0], b.window[0]].filter(Boolean).map((s) => monthNum(s!));
  const ends = [a.window[1], b.window[1]].filter(Boolean).map((s) => monthNum(s!));
  const y0 = Math.floor(Math.min(...starts, monthNum(TODAY)) / 12);
  const y1 = Math.ceil((Math.max(...ends, monthNum(TODAY)) + 1) / 12);
  const lo = y0 * 12, hi = y1 * 12;
  const W = 420, L = 0, bar = 14;
  const x = (m: number) => L + ((m - lo) / (hi - lo)) * (W - L);
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  const color = (p: Project) => (p.utility === "DESC" ? "var(--color-desc)" : p.utility === "GPC" ? "var(--color-gpc)" : "var(--color-coplan)");
  const ink = light ? "#555" : "var(--color-fg-3)";
  const rows = [a, b];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} 92`} className="w-full" role="img" aria-label={`Build windows: ${shortName(a)} ${monthYear(a.window[0])} to ${monthYear(a.window[1])}; ${shortName(b)} ${monthYear(b.window[0])} to ${monthYear(b.window[1])}`}>
        {years.map((y) => (
          <g key={y}>
            <line x1={x(y * 12)} x2={x(y * 12)} y1={0} y2={70} stroke={light ? "#ddd" : "var(--color-line)"} />
            {(years.length < 12 || y % 2 === 0) && <text x={x(y * 12) + 3} y={86} fontSize="10" fill={ink} className="num">{y}</text>}
          </g>
        ))}
        {pair.overlap_window && (
          <rect x={x(monthNum(pair.overlap_window[0]))} width={Math.max(2, x(monthNum(pair.overlap_window[1])) - x(monthNum(pair.overlap_window[0])))} y={2} height={66} fill="var(--color-t3)" opacity={0.16} rx={3} />
        )}
        {rows.map((p, i) => {
          if (!p.window[0] || !p.window[1]) return null;
          const s = monthNum(p.window[0]), e = monthNum(p.window[1]);
          const y = 12 + i * 30;
          return (
            <g key={p.id}>
              <rect x={x(s)} y={y} width={Math.max(3, x(e) - x(s))} height={bar} rx={bar / 2} fill={color(p)} opacity={0.9} />
              <circle cx={x(e)} cy={y + bar / 2} r={4} fill={light ? "#fff" : "var(--color-ink-0)"} stroke={color(p)} strokeWidth={2} />
            </g>
          );
        })}
        <line x1={x(monthNum(TODAY))} x2={x(monthNum(TODAY))} y1={0} y2={72} stroke={light ? "#111" : "var(--color-fg)"} strokeDasharray="2 3" />
        <text x={x(monthNum(TODAY)) + 4} y={9} fontSize="9.5" fill={light ? "#111" : "var(--color-fg-2)"}>today</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: light ? "#444" : "var(--color-fg-2)" }}>
        {rows.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-full" style={{ background: color(p) }} />
            <span className="num">{monthYear(p.window[0])} → {monthYear(p.window[1])}</span>
          </span>
        ))}
        {pair.overlap_window && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-t3/40" /> shared months</span>}
      </figcaption>
    </figure>
  );
}
