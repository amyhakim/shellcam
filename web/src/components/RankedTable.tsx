import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { CONF_LABEL, PRIORITY_COLOR, TIER, UTILITY_COLOR, UTILITY_NAME, monthYear, priority, shortName } from "../data/format";
import type { Pair, Project } from "../data/types";
import { useStore } from "../state/store";
import { UtilitySymbol } from "./bits";
import { flyTo } from "./camera";

import { measurementText } from "../data/mapPresentation";

type Sort = "score" | "nearest" | "soonest";

/** Readable, keyboard-accessible results linked to the map. */
export default function RankedTable() {
  const { state } = useStore();
  return state.filters.view === "projects" ? <ProjectTable /> : <OpportunityTable />;
}

function Shell({ title, sub, right, children }: { title: string; sub: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="results-shell" aria-label={title}>
      <div className="results-heading">
        <div className="flex items-center justify-between gap-3"><h2>{title}</h2><span className="text-[12px] text-fg-3">{sub}</span></div>
        {right}
      </div>
      <div className="results-scroll">{children}</div>
    </section>
  );
}

function OpportunityTable() {
  const { state, dispatch, visiblePairs } = useStore();
  const [sort, setSort] = useState<Sort>("score");
  const rows = useMemo(() => {
    const r = [...visiblePairs];
    if (sort === "score") r.sort((x, y) => y.score - x.score);
    if (sort === "nearest") r.sort((x, y) => (state.advanced.method === "closest" ? x.km - y.km : x.center_mi - y.center_mi));
    if (sort === "soonest") r.sort((x, y) => (x.in_service_gap_days ?? 1e9) - (y.in_service_gap_days ?? 1e9));
    return r;
  }, [visiblePairs, sort, state.advanced.method]);
  return (
    <Shell title="Coordination opportunities" sub={<><span className="num">{visiblePairs.length}</span> pairs</>}
      right={<div className="result-sort" role="group" aria-label="Sort">
        <span>Sort by</span>
        {([["score", "Score"], ["nearest", "Nearest"], ["soonest", "Completion gap"]] as [Sort, string][]).map(([id, label]) => (
          <button key={id} aria-pressed={sort === id} onClick={() => setSort(id)}>{label}</button>
        ))}
      </div>}>
      {rows.length === 0 ? <div className="workspace-empty"><h3>No pairs match these filters</h3><p>Widen the distance or clear the year to see more opportunities.</p><button className="btn" onClick={() => dispatch({ type: "resetFilters" })}>Reset filters</button></div>
        : <ol className="result-list">{rows.map((p, i) => <Row key={p.id} p={p} n={i + 1} />)}</ol>}
    </Shell>
  );
}

function Row({ p, n }: { p: Pair; n: number }) {
  const { state, dispatch, data } = useStore();
  const a = data.byId.get(p.a)!, b = data.byId.get(p.b)!;
  const pr = priority(p);
  const measurement = measurementText(p, state.advanced.method);
  return (
    <li>
      <button className={`result-row ${state.hovered === p.id ? "is-hovered" : ""}`} aria-pressed={state.selected === p.id && !state.selectedProject}
        onClick={() => { dispatch({ type: "select", id: p.id }); if (state.selected === p.id) flyTo({ kind: "pair", id: p.id }); }}
        onMouseEnter={() => dispatch({ type: "hover", id: p.id })} onMouseLeave={() => dispatch({ type: "hover", id: null })}
        onFocus={() => dispatch({ type: "hover", id: p.id })} onBlur={() => dispatch({ type: "hover", id: null })}>
        <span className="result-row-top"><span className="num text-fg-3">{String(n).padStart(2, "0")}</span><span style={{ color: PRIORITY_COLOR[pr] }}>{pr} priority{p.override === "crossing" ? " · crossing" : ""}</span><span className="result-score"><b className="num">{p.score.toFixed(0)}</b><span>/100</span></span></span>
        <span className="result-names"><span style={{ color: UTILITY_COLOR[a.utility] }}><UtilitySymbol utility={a.utility} />{shortName(a)}</span><span style={{ color: UTILITY_COLOR[b.utility] }}><UtilitySymbol utility={b.utility} />{shortName(b)}</span></span>
        <span className="result-facts"><span title={measurement.description}><span className="num">{measurement.distance}</span><span className="sr-only">{measurement.description}</span>{(state.advanced.method === "guide" || p.measurement === "estimate") && <span className="text-fg-2" aria-hidden="true">est.</span>}</span><span>{p.in_service_gap_days == null ? "Schedule unknown" : `${p.in_service_gap_days.toLocaleString()} d completion gap`}</span><ArrowUpRight size={14} className="result-arrow" /></span>
        {p.tier && <span className="result-distance-meaning">{TIER[p.tier].label}</span>}
        {p.timeline === "concurrent" && <span className="result-timing">Construction windows overlap</span>}
        {p.timeline !== "concurrent" && p.completion_sync && <span className="result-timing">Finish close together</span>}
      </button>
    </li>
  );
}

function ProjectTable() {
  const { state, dispatch, visibleProjects } = useStore();
  const rows = useMemo(() => [...visibleProjects].sort((a, b) => (a.in_service ?? "").localeCompare(b.in_service ?? "")), [visibleProjects]);
  return <Shell title="All projects" sub={<><span className="num">{rows.length}</span> projects</>} right={<p className="mt-1 text-[12px] text-fg-3">Sorted by planned completion</p>}>
    {rows.length === 0 ? <div className="workspace-empty"><h3>No projects match these filters</h3><button className="btn" onClick={() => dispatch({ type: "resetFilters" })}>Reset filters</button></div> : <ul className="result-list">
      {rows.map((p) => <ProjectRow key={p.id} p={p} selected={state.selectedProject === p.id} hovered={state.hovered === p.id}
        onPick={() => { dispatch({ type: "selectProject", id: p.id }); if (p.located) flyTo({ kind: "project", id: p.id }); }}
        onHover={(on) => dispatch({ type: "hover", id: on ? p.id : null })} />)}
    </ul>}
  </Shell>;
}

function ProjectRow({ p, selected, hovered, onPick, onHover }: { p: Project; selected: boolean; hovered: boolean; onPick: () => void; onHover: (on: boolean) => void }) {
  return <li><button className={`result-row ${hovered ? "is-hovered" : ""}`} aria-pressed={selected} onClick={onPick}
    onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} onFocus={() => onHover(true)} onBlur={() => onHover(false)}>
    <span className="result-row-top"><span className="utility-name"><UtilitySymbol utility={p.utility} />{UTILITY_NAME[p.utility]}</span><span className="num ml-auto">{p.source_id}</span></span>
    <span className="result-names" style={{ color: UTILITY_COLOR[p.utility] }}>{shortName(p)}</span>
    <span className="result-facts"><span className="num">{p.voltage_kv ? `${p.voltage_kv} kV` : "Voltage unknown"}</span><span>{monthYear(p.in_service)}</span><ArrowUpRight size={14} className="result-arrow" /></span>
    <span className="mt-1 block text-[12px] text-fg-3">{CONF_LABEL[p.confidence]}</span>
  </button></li>;
}
