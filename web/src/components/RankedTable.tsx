import { useMemo, useState } from "react";
import { CONF_LABEL, PRIORITY_COLOR, TIER, UTILITY_COLOR, UTILITY_NAME, kmLabel, monthYear, priority, shortName } from "../data/format";
import type { Pair, Project } from "../data/types";
import { useStore } from "../state/store";
import { TierIcon } from "./bits";
import { flyTo } from "./camera";

type Sort = "score" | "nearest" | "soonest";

/** Ranked opportunity table (also the accessible alternative to the map). */
export default function RankedTable() {
  const { state } = useStore();
  return state.filters.view === "projects" ? <ProjectTable /> : <OpportunityTable />;
}

function Shell({ title, sub, right, children }: { title: string; sub: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel flex h-[520px] flex-col overflow-hidden lg:h-[620px]" aria-label={title}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="text-[12px] text-fg-3">{sub}</p>
        </div>
        {right}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function OpportunityTable() {
  const { state, visiblePairs } = useStore();
  const [sort, setSort] = useState<Sort>("score");
  const rows = useMemo(() => {
    const r = [...visiblePairs];
    if (sort === "nearest") r.sort((x, y) => (state.advanced.method === "closest" ? x.km - y.km : x.center_mi - y.center_mi));
    if (sort === "soonest") r.sort((x, y) => (x.in_service_gap_days ?? 1e9) - (y.in_service_gap_days ?? 1e9));
    return r;
  }, [visiblePairs, sort, state.advanced.method]);
  return (
    <Shell
      title="Ranked opportunities"
      sub={<><span className="num">{visiblePairs.length}</span> pairs · ranked by a 100-point score</>}
      right={
        <div className="seg" role="group" aria-label="Sort">
          {([["score", "Score"], ["nearest", "Nearest"], ["soonest", "Dates closest"]] as [Sort, string][]).map(([id, l]) => (
            <button key={id} aria-pressed={sort === id} onClick={() => setSort(id)}>{l}</button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <p className="font-medium">No pairs match these filters</p>
          <p className="mt-1 text-[13px] text-fg-3">Most planned projects are far apart. Widen the distance or clear the year.</p>
        </div>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-ink-1 text-[11.5px] text-fg-3">
            <tr className="border-b border-line">
              <th className="py-2 pl-4 pr-1 font-medium">#</th>
              <th className="py-2 pr-2 font-medium">Pair</th>
              <th className="py-2 pr-2 text-right font-medium">Distance</th>
              <th className="py-2 pr-2 text-right font-medium">Date gap</th>
              <th className="py-2 pr-4 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>{rows.map((p, i) => <Row key={p.id} p={p} n={i + 1} />)}</tbody>
        </table>
      )}
    </Shell>
  );
}

function Row({ p, n }: { p: Pair; n: number }) {
  const { state, dispatch, data } = useStore();
  const a = data.byId.get(p.a)!, b = data.byId.get(p.b)!;
  const sel = state.selected === p.id;
  const hov = state.hovered === p.id;
  const pr = priority(p);
  const tier = p.tier ?? 4;
  const pick = () => dispatch({ type: "select", id: p.id });
  return (
    <tr
      tabIndex={0}
      aria-selected={sel}
      onClick={pick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick())}
      onMouseEnter={() => dispatch({ type: "hover", id: p.id })}
      onMouseLeave={() => dispatch({ type: "hover", id: null })}
      className={`cursor-pointer border-b border-line/60 align-top transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 ${sel ? "bg-ink-3" : hov ? "bg-ink-2" : "hover:bg-ink-2"}`}
    >
      <td className="num py-2.5 pl-4 pr-1 text-fg-3">{n}</td>
      <td className="max-w-0 py-2.5 pr-2">
        <div className="truncate font-medium" style={{ color: UTILITY_COLOR[a.utility] }}>{shortName(a)}</div>
        <div className="truncate" style={{ color: UTILITY_COLOR[b.utility] }}>{shortName(b)}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="rounded px-1.5 py-px font-semibold uppercase tracking-[0.04em]" style={{ color: PRIORITY_COLOR[pr], background: `color-mix(in oklab, ${PRIORITY_COLOR[pr]} 13%, transparent)` }}>{pr}</span>
          {p.override === "crossing" && <span className="rounded bg-t1/15 px-1.5 py-px font-semibold uppercase tracking-[0.04em] text-t1">Crossing</span>}
          {p.timeline === "concurrent" && <span className="text-t3">builds overlap</span>}
          {p.timeline !== "concurrent" && p.completion_sync && <span className="text-t4">finish close together</span>}
        </div>
      </td>
      <td className="num whitespace-nowrap py-2.5 pr-2 text-right">
        <span className="inline-flex items-center gap-1" style={{ color: TIER[tier].color }}><TierIcon tier={tier} size={12} strokeWidth={2.4} />{kmLabel(p, state.advanced.method)}</span>
        {p.measurement === "estimate" && <div className="text-[10.5px] text-fg-3">estimate</div>}
      </td>
      <td className="num whitespace-nowrap py-2.5 pr-2 text-right text-fg-2">{p.in_service_gap_days == null ? "—" : `${p.in_service_gap_days.toLocaleString()} d`}</td>
      <td className="num py-2.5 pr-4 text-right font-semibold">{p.score.toFixed(0)}</td>
    </tr>
  );
}

function ProjectTable() {
  const { state, dispatch, visibleProjects } = useStore();
  const rows = useMemo(() => [...visibleProjects].sort((a, b) => (a.in_service ?? "").localeCompare(b.in_service ?? "")), [visibleProjects]);
  return (
    <Shell title="All projects" sub={<><span className="num">{rows.length}</span> projects · sorted by planned completion</>}>
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-ink-1 text-[11.5px] text-fg-3">
          <tr className="border-b border-line">
            <th className="py-2 pl-4 pr-2 font-medium">Project</th>
            <th className="py-2 pr-2 text-right font-medium">kV</th>
            <th className="py-2 pr-2 text-right font-medium">Complete</th>
            <th className="py-2 pr-4 font-medium">Location</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => <ProjectRow key={p.id} p={p} sel={state.selectedProject === p.id} hov={state.hovered === p.id}
            onPick={() => { dispatch({ type: "selectProject", id: p.id }); if (p.located) flyTo({ kind: "project", id: p.id }); }}
            onHover={(on) => dispatch({ type: "hover", id: on ? p.id : null })} />)}
        </tbody>
      </table>
    </Shell>
  );
}

function ProjectRow({ p, sel, hov, onPick, onHover }: { p: Project; sel: boolean; hov: boolean; onPick: () => void; onHover: (on: boolean) => void }) {
  return (
    <tr tabIndex={0} aria-selected={sel} onClick={onPick} onKeyDown={(e) => e.key === "Enter" && onPick()} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)}
      className={`cursor-pointer border-b border-line/60 transition-colors ${sel ? "bg-ink-3" : hov ? "bg-ink-2" : "hover:bg-ink-2"}`}>
      <td className="max-w-0 py-2 pl-4 pr-2">
        <div className="truncate" style={{ color: UTILITY_COLOR[p.utility] }}>{shortName(p)}</div>
        <div className="truncate text-[11.5px] text-fg-3">{UTILITY_NAME[p.utility]} · {p.source_id}</div>
      </td>
      <td className="num py-2 pr-2 text-right text-fg-2">{p.voltage_kv ?? "—"}</td>
      <td className="num whitespace-nowrap py-2 pr-2 text-right text-fg-2">{monthYear(p.in_service)}</td>
      <td className="py-2 pr-4 text-[12px] text-fg-3">{CONF_LABEL[p.confidence]}</td>
    </tr>
  );
}
