import { ChartNoAxesCombined, ChevronDown, Download, FileSpreadsheet, Info, Layers, ListFilter, MapPin, Maximize2, Minus, Play, Plus, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CONF_LABEL, UTILITY_COLOR, UTILITY_NAME, kmLabel, monthYear, shortName } from "../data/format";
import { RANGES, useStore, type Range, type UtilityFilter, type ViewMode, type VoltageFilter } from "../state/store";
import { UtilitySymbol } from "./bits";
import { measurementText } from "../data/mapPresentation";
import type { Utility } from "../data/types";
import { flyTo } from "./camera";
import { exportCsv } from "./exporters";
import Insights from "./Insights";
import MapView from "./MapView";
import RankedTable from "./RankedTable";
import SelectedCards from "./SelectedCards";

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <path d="M5 24 L13.5 9 L18.5 18 L27 6" fill="none" stroke="var(--color-desc)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 24 L13.5 9" fill="none" stroke="var(--color-gpc)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="18.5" cy="18" r="3.4" fill="var(--color-t3)" />
      </svg>
      <span className="wordmark-text">GridLock <span>Intelligence</span></span>
    </div>
  );
}

export default function Dashboard() {
  const { state, dispatch, data } = useStore();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filterPanel = useRef<HTMLDivElement>(null);
  const activeFilters = Number(state.filters.utility !== "both") + Number(state.filters.year !== "all")
    + Number(state.filters.voltage !== "all") + Number(state.filters.range !== 40) + Number(state.filters.view !== "opportunities");

  useEffect(() => {
    if (!filtersOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!filterPanel.current?.contains(e.target as Node) && !filterButton.current?.contains(e.target as Node)) setFiltersOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setFiltersOpen(false); filterButton.current?.focus(); }
    };
    addEventListener("pointerdown", onPointer);
    addEventListener("keydown", onKey);
    return () => { removeEventListener("pointerdown", onPointer); removeEventListener("keydown", onKey); };
  }, [filtersOpen]);

  return (
    <main className="map-workspace" aria-label="Transmission coordination workspace">
      <MapView />
      <header className="workspace-header map-surface">
        <Wordmark />
        <span className="workspace-territory">Georgia <span aria-hidden> / </span> South Carolina</span>
        <div className="workspace-actions">
          <button className="btn workspace-search" onClick={() => dispatch({ type: "palette", on: true })} aria-label="Search or type a request (Ctrl K)"><Search size={16} /><span>Find a project</span><kbd className="kbd">⌘ K</kbd></button>
          <button ref={filterButton} className="btn" aria-label={`Filters${activeFilters ? `, ${activeFilters} active` : ""}`} aria-expanded={filtersOpen} aria-controls="workspace-filters" onClick={() => setFiltersOpen((v) => !v)}><SlidersHorizontal size={16} /><span className="filter-button-label">Filters</span>{activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}</button>
          <button className="btn icon-button" onClick={() => dispatch({ type: "drawer", drawer: "method" })} aria-label="How this was calculated" title="How this was calculated"><Info size={17} /></button>
          <ExportMenu />
          <button className="btn btn-primary demo-button" aria-label="Start demo" onClick={() => dispatch({ type: "tour", step: 0 })}><Play size={14} /><span>Demo</span></button>
        </div>
      </header>
      {filtersOpen && <div ref={filterPanel} id="workspace-filters" className="workspace-filters map-surface">
        <div className="flex items-center justify-between px-4 pt-3"><h2 className="font-semibold">Filter the map</h2><button className="btn icon-button" aria-label="Close filters" onClick={() => { setFiltersOpen(false); filterButton.current?.focus(); }}><X size={16} /></button></div>
        <FilterBar />
      </div>}
      <Kpis />
      <WorkspacePanels />
      <MapTools />
      <SelectionAnnouncement />
      <footer className="workspace-footer">
        <button onClick={() => dispatch({ type: "drawer", drawer: "method" })}>Public filings · {data.meta.funnel.desc_projects + data.meta.funnel.ga_projects - data.meta.funnel.located_desc - data.meta.funnel.located_ga} projects unlocated · Data updated {monthYear(data.meta.generated.slice(0, 7))}</button>
        <span>Estimates · verify routes and schedules</span>
      </footer>
    </main>
  );
}

function WorkspacePanels() {
  const { state } = useStore();
  return <div className={`workspace-dock ${state.resultsOpen ? "has-results" : ""} ${state.analysisOpen ? "has-analysis" : ""}`}>
    <ResultsPanel />
    <AnalysisPanel />
  </div>;
}

function ResultsPanel() {
  const { state, dispatch, visiblePairs, visibleProjects } = useStore();
  const count = state.filters.view === "projects" ? visibleProjects.length : visiblePairs.length;
  return <aside className={`workspace-panel results-panel map-surface ${state.resultsOpen ? "is-expanded" : "is-collapsed"}`} aria-label="Results">
    <div className="workspace-panel-header">
      <h2><ListFilter size={16} /> Results <span className="num result-count">{count}</span></h2>
      <button className="btn icon-button panel-toggle" aria-label={state.resultsOpen ? "Collapse results" : "Expand results"} aria-expanded={state.resultsOpen} aria-controls="workspace-results" onClick={() => dispatch({ type: "workspace", panel: "results", open: !state.resultsOpen })}>
        <ChevronDown size={17} className={state.resultsOpen ? "" : "rotate-180"} />
      </button>
    </div>
    <div id="workspace-results" className="workspace-results" hidden={!state.resultsOpen}><RankedTable /></div>
  </aside>;
}

function AnalysisPanel() {
  const { state, dispatch } = useStore();
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (details.current) details.current.scrollTop = 0;
  }, [state.selected, state.selectedProject]);
  return <aside className={`workspace-panel inspector-panel map-surface ${state.analysisOpen ? "is-expanded" : "is-collapsed"}`} aria-label="Selected and insights">
    <div className="workspace-panel-header">
      <div className="inspector-modes" role="group" aria-label="Analysis view">
        <button className="workspace-tab" aria-pressed={state.analysisPanel === "details" && state.analysisOpen} aria-controls="workspace-details" onClick={() => dispatch({ type: "workspace", panel: "details" })}><MapPin size={15} /> Selected</button>
        <button className="workspace-tab" aria-pressed={state.analysisPanel === "insights" && state.analysisOpen} aria-controls="workspace-insights" onClick={() => dispatch({ type: "workspace", panel: "insights" })}><ChartNoAxesCombined size={15} /> Insights</button>
      </div>
      <button className="btn icon-button panel-toggle" aria-label={state.analysisOpen ? "Collapse analysis" : "Expand analysis"} aria-expanded={state.analysisOpen} aria-controls={state.analysisPanel === "details" ? "workspace-details" : "workspace-insights"} onClick={() => dispatch({ type: "workspace", panel: state.analysisPanel, open: !state.analysisOpen })}>
        <ChevronDown size={17} className={state.analysisOpen ? "" : "rotate-180"} />
      </button>
    </div>
    <div id="workspace-details" ref={details} className="workspace-analysis" hidden={!state.analysisOpen || state.analysisPanel !== "details"}><SelectionDetails /></div>
    <div id="workspace-insights" className="workspace-analysis" hidden={!state.analysisOpen || state.analysisPanel !== "insights"}>
      <InspectorSelection />
      <p className="inspector-scope">Insights · all filtered opportunities</p>
      <Insights />
    </div>
  </aside>;
}

function InspectorSelection() {
  const { state, data } = useStore();
  const project = state.selectedProject ? data.byId.get(state.selectedProject) : null;
  const pair = !project && state.selected && state.filters.view === "opportunities" ? data.pairById.get(state.selected) : null;
  if (!project && !pair) return null;
  const projects = project ? [project] : [data.byId.get(pair!.a)!, data.byId.get(pair!.b)!];
  return <section className="inspector-selection" aria-label="Current selection">
    {projects.map((p) => <p key={p.id}><UtilitySymbol utility={p.utility} /><span>{shortName(p)}</span></p>)}
    {pair && <p className="num">{measurementText(pair, state.advanced.method).label}</p>}
  </section>;
}

function SelectionDetails() {
  const { state, dispatch, data } = useStore();
  const project = state.selectedProject ? data.byId.get(state.selectedProject) : null;
  if (project) return <section className="project-detail">
    <h2 style={{ color: UTILITY_COLOR[project.utility] }}>{shortName(project)}</h2>
    <p className="mt-1 text-fg-2">{UTILITY_NAME[project.utility]} · {project.source_id}</p>
    <dl className="project-facts">
      <div><dt>Voltage</dt><dd>{project.voltage_kv ? `${project.voltage_kv} kV` : "Not stated"}</dd></div>
      <div><dt>Completion</dt><dd>{monthYear(project.in_service)}</dd></div>
      <div><dt>Location</dt><dd>{CONF_LABEL[project.confidence]}</dd></div>
    </dl>
    <p className="text-[13px] leading-relaxed text-fg-2">{project.description}</p>
    {!project.located && <p className="mt-3 text-t2">This project could not be located on the map. Its filing is still available.</p>}
    <button className="btn btn-primary mt-4" onClick={() => dispatch({ type: "drawer", drawer: "source" })}>View source</button>
  </section>;
  if (state.selected && state.filters.view === "opportunities") return <SelectedCards />;
  return <div className="workspace-empty"><MapPin size={24} /><h2>Select a {state.filters.view === "projects" ? "project" : "pair"} to explore</h2><p>Choose a result or a route on the map to see its details and source.</p><button className="btn" onClick={() => dispatch({ type: "workspace", panel: "results" })}>Browse results</button></div>;
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="block min-w-0">
      <span className="label block">{label}</span>
      <select
        aria-label={label}
        className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-line bg-ink-2 px-2.5 text-[13.5px] text-fg outline-none transition-colors hover:border-line-strong focus-visible:border-t3"
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o.v) === e.target.value)!.v)}
      >
        {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.label}</option>)}
      </select>
    </label>
  );
}

const YEARS = ["all", ...Array.from({ length: 12 }, (_, i) => String(2023 + i))];

function FilterBar() {
  const { state, dispatch } = useStore();
  const f = state.filters;
  const set = (patch: Partial<typeof f>) => dispatch({ type: "filters", patch });
  const adv = state.advanced;
  const advancedOn = adv.method !== "closest" || adv.region !== "all" || adv.timing !== "any";
  return (
    <section className="filter-fields" aria-label="Filters">
      <Select<UtilityFilter> label="Utility" value={f.utility} onChange={(v) => set({ utility: v })} options={[
        { v: "both", label: "Both utilities" }, { v: "DESC", label: "Dominion Energy SC" }, { v: "GPC", label: "Georgia Power" }, { v: "allGA", label: "+ Georgia co-planners" }]} />
      <Select label="Planned completion" value={f.year} onChange={(v) => set({ year: v })} options={YEARS.map((y) => ({ v: y, label: y === "all" ? "All years (2023–2034)" : y }))} />
      <Select<VoltageFilter> label="Voltage" value={f.voltage} onChange={(v) => set({ voltage: v })} options={[
        { v: "all", label: "All voltages" }, { v: "500", label: "500 kV" }, { v: "230", label: "230 kV" }, { v: "115", label: "115 kV" }, { v: "low", label: "Under 100 kV" }]} />
      <Select<Range> label="Distance" value={f.range} options={RANGES} onChange={(v) => set({ range: v })} />
      <Select<ViewMode> label="Show" value={f.view} onChange={(v) => set({ view: v })} options={[{ v: "opportunities", label: "Coordination opportunities" }, { v: "projects", label: "All projects" }]} />
      <div className="filter-reset flex items-center gap-1">
        <button className="btn h-9 text-t3 hover:text-t3" onClick={() => dispatch({ type: "resetFilters" })}><RotateCcw size={14} /> Reset filters</button>
        {advancedOn && (
          <button className="chip bg-t3/15 text-t3" onClick={() => dispatch({ type: "drawer", drawer: "method" })} title="Advanced settings are active">
            <SlidersHorizontal size={12} /> Advanced
          </button>
        )}
      </div>
    </section>
  );
}

function Kpi({ label, value, unit, foot, dot }: { label: string; value: React.ReactNode; unit?: string; foot: React.ReactNode; dot: string }) {
  return (
    <div className="workspace-metric" title={typeof foot === "string" ? foot : undefined}>
      <div className="label flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} aria-hidden />{label}</div>
      <div className="num metric-value">{value}{unit && <span className="ml-1 text-[15px] font-medium text-fg-2">{unit}</span>}</div>
      <div className="metric-foot">{foot}</div>
    </div>
  );
}

function Kpis() {
  const { state, data, visiblePairs, visibleProjects } = useStore();
  const s = useMemo(() => {
    const closest = [...visiblePairs].sort((a, b) => (state.advanced.method === "closest" ? a.km - b.km : a.center_mi - b.center_mi))[0];
    return {
      desc: visibleProjects.filter((p) => p.utility === "DESC").length,
      ga: visibleProjects.filter((p) => p.utility !== "DESC").length,
      overlap: visiblePairs.filter((p) => p.timeline === "concurrent").length,
      sync: visiblePairs.filter((p) => p.timeline !== "concurrent" && p.completion_sync).length,
      closest,
    };
  }, [visiblePairs, visibleProjects, state.advanced.method]);
  const c = s.closest;
  const [cv, cu] = c ? kmLabel(c, state.advanced.method).split(" ") : ["—", ""];
  return (
    <section className="workspace-summary map-surface" aria-label="Summary">
      <Kpi label="Projects" value={visibleProjects.length} foot={`${s.desc} Dominion SC · ${s.ga} Georgia`} dot="var(--color-fg-3)" />
      <Kpi label="Opportunities" value={visiblePairs.length} foot={`cross-utility pairs · ${state.filters.range === 0.05 ? "touching" : `≤ ${state.filters.range} km`}`} dot="var(--color-t4)" />
      <Kpi label="Timing matches" value={s.overlap + s.sync} foot={`${s.overlap} overlapping builds · ${s.sync} finish within 180 days`} dot="var(--color-t3)" />
      <Kpi label="Closest pair" value={cv} unit={cu} foot={c ? `${shortName(data.byId.get(c.a)!)} ↔ ${shortName(data.byId.get(c.b)!)}` : "—"} dot="var(--color-t1)" />
    </section>
  );
}

function MapTools() {
  const { state, dispatch } = useStore();
  return (
    <div className="map-tools">
      <div className="map-regions map-surface" role="group" aria-label="Map regions">
        {(["Savannah", "Augusta"] as const).map((name) => <button className="btn" key={name} onClick={() => flyTo({ kind: "region", name })}>{name}</button>)}
        <button className="btn icon-button" onClick={() => flyTo({ kind: "region", name: "southeast" })} aria-label="Whole border" title="Whole border"><Maximize2 size={16} /></button>
      </div>
      <div className="map-layer-tools map-surface">
        <div className="seg" role="group" aria-label="Basemap">
          <button aria-pressed={state.basemap === "dark"} onClick={() => dispatch({ type: "basemap", basemap: "dark" })}>Map</button>
          <button aria-pressed={state.basemap === "satellite"} onClick={() => dispatch({ type: "basemap", basemap: "satellite" })}>Satellite</button>
        </div>
        <button className="btn icon-button" aria-pressed={state.showGrid} onClick={() => dispatch({ type: "grid", on: !state.showGrid })} aria-label="Show existing 115–500 kV lines" title="Existing 115–500 kV lines"><Layers size={16} /></button>
      </div>
      <div className="map-tool-bottom">
      <MapLegend />
      <div className="map-zoom map-surface">
        <button className="btn icon-button" onClick={() => flyTo({ kind: "zoom", dir: 1 })} aria-label="Zoom in"><Plus size={18} /></button>
        <button className="btn icon-button" onClick={() => flyTo({ kind: "zoom", dir: -1 })} aria-label="Zoom out"><Minus size={18} /></button>
      </div>
      </div>
      {state.month && <button className="map-month map-surface" onClick={() => dispatch({ type: "month", month: null })}>Only {monthYear(state.month)} <X size={14} /><span className="sr-only">Clear month filter</span></button>}
    </div>
  );
}

function SelectionAnnouncement() {
  const { state, data } = useStore();
  const project = state.selectedProject ? data.byId.get(state.selectedProject) : null;
  const pair = !project && state.selected ? data.pairById.get(state.selected) : null;
  const message = project ? `Selected ${UTILITY_NAME[project.utility]}: ${shortName(project)}.`
    : pair ? `Selected ${shortName(data.byId.get(pair.a)!)} and ${shortName(data.byId.get(pair.b)!)}. ${measurementText(pair, state.advanced.method).label}.`
    : "";
  return <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</p>;
}

function MapLegend() {
  const { visibleProjects, state, dispatch } = useStore();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const others = [...new Set(visibleProjects.map((p) => p.utility).filter((utility) => utility !== "DESC" && utility !== "GPC"))];
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    addEventListener("pointerdown", closeOutside);
    addEventListener("keydown", closeEscape);
    return () => { removeEventListener("pointerdown", closeOutside); removeEventListener("keydown", closeEscape); };
  }, [open]);
  const key = (utility: Utility) => <li key={utility}><UtilitySymbol utility={utility} size={20} /><span>{UTILITY_NAME[utility]}</span></li>;
  return <div className="map-key-control" ref={root}>
    <button ref={trigger} className="btn map-surface map-key-trigger" aria-expanded={open} aria-controls="map-key" onClick={() => setOpen((value) => !value)}>Map key <ChevronDown size={16} /></button>
    {open && <section className="map-key-popover map-surface" id="map-key" aria-label="Map key">
      <div className="map-key-heading"><h2>Utilities</h2><button className="btn icon-button" aria-label="Close map key" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={16} /></button></div>
      <ul className="map-key-utilities">{key("DESC")}{key("GPC")}{others.map(key)}</ul>
      <p>Select a pair to see its distance.</p>
      <details className="map-key-lines">
        <summary>Routes & measurements <ChevronDown size={16} /></summary>
        <ul>
          <li><LineKey kind="mapped" /><span>Mapped project route</span></li>
          <li><LineKey kind="approximate" /><span>Approximate project route</span></li>
          <li><LineKey kind="measurement" /><span>Distance between measured points</span></li>
          {state.showGrid && <li><LineKey kind="grid" /><span>Existing transmission grid</span></li>}
        </ul>
        <p>Distance labels name the measurement method. Endpoint and center distances are estimates.</p>
        <button className="btn map-key-method" onClick={() => { setOpen(false); dispatch({ type: "drawer", drawer: "method" }); }}>Distance thresholds & methodology</button>
      </details>
    </section>}
  </div>;
}

function LineKey({ kind }: { kind: "mapped" | "approximate" | "measurement" | "grid" }) {
  return <svg width="36" height="20" viewBox="0 0 36 20" aria-hidden="true">
    <path d="M3 10H33" stroke={kind === "grid" ? "var(--color-coplan)" : "currentColor"} strokeWidth={kind === "grid" ? 1 : 2} strokeDasharray={kind === "approximate" ? "5 4" : undefined} />
    {kind === "measurement" && <path d="M5 5V15M31 5V15" stroke="currentColor" strokeWidth="2" />}
  </svg>;
}

function ExportMenu() {
  const { state, data, visiblePairs } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className="btn icon-button" aria-label="Export" title="Export" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Download size={16} /></button>
      {open && (
        <div className="panel anim-rise absolute right-0 top-11 z-40 w-[280px] p-1.5" role="menu">
          <a className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-ink-3" href="/downloads/Projects_Overlaps_GridLock.xlsx" download role="menuitem">
            <FileSpreadsheet size={17} className="text-money" /><span><span className="block font-medium">Excel (.xlsx)</span><span className="block text-[12px] text-fg-3">Sperry starter-file columns</span></span>
          </a>
          <button className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-ink-3" role="menuitem" onClick={() => { exportCsv(data, visiblePairs, state.assumptions); setOpen(false); }}>
            <Download size={17} className="text-t4" /><span><span className="block font-medium">CSV of this view</span><span className="block text-[12px] text-fg-3">{visiblePairs.length} opportunities with scores</span></span>
          </button>
        </div>
      )}
    </div>
  );
}
