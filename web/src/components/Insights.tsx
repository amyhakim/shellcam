import { Check, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { TIER, money, monthNum, monthYear } from "../data/format";
import { estimateSavings } from "../data/savings";
import type { TierId } from "../data/types";
import { useStore } from "../state/store";
import { TierIcon } from "./bits";

export default function Insights() {
  return (
    <div className="workspace-insights">
      <ValueByTier />
      <Monthly />
      <Quality />
    </div>
  );
}

function Card({ title, sub, children, action }: { title: string; sub: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="detail-section flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="text-[12px] text-fg-3">{sub}</p>
        </div>
        {action}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

function ValueByTier() {
  const { state, data, visiblePairs } = useStore();
  const rows = useMemo(() => {
    const r = ([1, 2, 3, 4] as TierId[]).map((t) => {
      const ps = visiblePairs.filter((p) => p.tier === t);
      return { t, n: ps.length, v: ps.reduce((s, p) => s + estimateSavings(p, data.byId.get(p.a)!, data.byId.get(p.b)!, state.assumptions).mid, 0) };
    });
    return { r, max: Math.max(...r.map((x) => x.v), 1) };
  }, [visiblePairs, data, state.assumptions]);
  return (
    <Card title="Illustrative value by tier" sub="Scenario estimate for pairs in view · not confirmed savings">
      <div className="space-y-3">
        {rows.r.map(({ t, n, v }) => (
          <div key={t}>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="inline-flex items-center gap-1.5" style={{ color: TIER[t].color }}><TierIcon tier={t} size={13} strokeWidth={2.4} />{TIER[t].label}</span>
              <span className="num text-fg-2"><span className="text-fg-3">{n} ·</span> {v > 0 ? money(v) : "—"}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-ink-2">
              {v > 0 && <div className="h-full rounded-full" style={{ width: `${Math.max(2, (v / rows.max) * 100)}%`, background: TIER[t].color }} />}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const key = (m: number) => `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;

function Monthly() {
  const { state, dispatch, visiblePairs } = useStore();
  const START = 2023 * 12, END = 2030 * 12 + 11;
  const months = useMemo(() => Array.from({ length: END - START + 1 }, (_, i) => START + i), [START, END]);
  const counts = useMemo(
    () => months.map((m) => visiblePairs.filter((p) => p.overlap_window && monthNum(p.overlap_window[0]) <= m && m <= monthNum(p.overlap_window[1])).length),
    [months, visiblePairs],
  );
  const max = Math.max(...counts, 1);
  const peak = counts.indexOf(max);
  const W = 400, H = 110, bw = W / months.length;
  const today = monthNum("2026-09") - START;
  return (
    <Card title="Overlapping builds by month" sub={max > 1 ? `Peak ${monthYear(key(months[peak]))}: ${max} pairs building at once · click a month to filter the map` : "Click a month to filter the map"}>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label="Overlapping builds per month">
        {Array.from({ length: 8 }, (_, i) => 2023 + i).map((y) => (
          <g key={y}>
            <line x1={(y * 12 - START) * bw} x2={(y * 12 - START) * bw} y1={0} y2={H} stroke="var(--color-line)" />
            <text x={(y * 12 - START) * bw + 3} y={H + 12} fontSize="10" fill="var(--color-fg-3)" className="num">{String(y).slice(2).padStart(3, "'")}</text>
          </g>
        ))}
        {counts.map((c, i) => {
          const on = state.month === key(months[i]);
          return (
            <g key={i} className="cursor-pointer" onClick={() => dispatch({ type: "month", month: on ? null : key(months[i]) })}>
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
              {c > 0 && <rect x={i * bw + 0.4} width={bw - 0.8} y={H - (c / max) * (H - 6)} height={(c / max) * (H - 6)} rx={1} fill={on ? "var(--color-fg)" : "var(--color-t3)"} opacity={on ? 1 : 0.85} />}
            </g>
          );
        })}
        <line x1={today * bw} x2={today * bw} y1={0} y2={H} stroke="var(--color-fg-2)" strokeDasharray="2 3" />
        <text x={today * bw + 3} y={9} fontSize="9.5" fill="var(--color-fg-2)">today</text>
      </svg>
    </Card>
  );
}

function Quality() {
  const { dispatch, data } = useStore();
  const q = data.quality;
  const sa = q.sample_audit;
  const f = data.meta.funnel;
  const mapped = f.located_desc + f.located_ga, total = f.desc_projects + f.ga_projects;
  const rows: [string, string, boolean][] = [
    ["Sperry sample distances reproduced", `${sa.reproduced.filter((r) => r.match).length}/${sa.reproduced.length}`, true],
    ["Sperry sample pairs found independently", `${sa.found.filter((x) => x.ours).length}/${sa.found.length}`, true],
    ["Projects placed on the map", `${mapped}/${total}`, mapped / total > 0.8],
    ["Issues found in the filings", String(q.source_issues.length), true],
    ["Georgia projects rescheduled since last plan", String((q.plan_changes.delayed ?? 0) + (q.plan_changes.advanced ?? 0)), true],
  ];
  return (
    <Card title="Data confidence" sub="Every number traces back to a filing page" action={<button className="btn h-8 px-2.5 text-[12.5px]" onClick={() => dispatch({ type: "drawer", drawer: "method" })}><ShieldCheck size={14} /> Details</button>}>
      <ul className="divide-y divide-line text-[13px]">
        {rows.map(([l, v, ok]) => (
          <li key={l} className="flex items-center justify-between gap-3 py-2">
            <span className="text-fg-2">{l}</span>
            <span className="num flex items-center gap-1.5">{v}{ok && <Check size={13} className="text-money" />}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
