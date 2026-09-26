import { Download, FileSpreadsheet, Info, Layers, Minus, Play, Plus, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { kmLabel, monthYear, shortName } from "../data/format";
import { RANGES, useStore, type Range, type UtilityFilter, type ViewMode, type VoltageFilter } from "../state/store";
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
      <span className="text-[17px] font-semibold tracking-[-0.02em]">GridLock <span className="font-normal text-fg-3">Intelligence</span></span>
    </div>
  );
}

export default function Dashboard() {
  const { state, dispatch, data } = useStore();
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-30 border-b border-line bg-ink-0/95">
        <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-3 px-4 sm:px-6">
          <Wordmark />
          <span className="ml-auto hidden text-[12.5px] text-fg-3 md:inline">Data updated <span className="num text-fg-2">{monthYear(data.meta.generated.slice(0, 7))}</span></span>
          <div className="ml-auto flex items-center gap-1 md:ml-3">
            <button className="btn" onClick={() => dispatch({ type: "palette", on: true })} aria-label="Search or type a request (Ctrl K)"><Search size={16} /><span className="kbd hidden lg:inline">Ctrl K</span></button>
            <button className="btn" onClick={() => dispatch({ type: "drawer", drawer: "method" })}><Info size={16} /><span className="hidden sm:inline">How this was calculated</span></button>
            <ExportMenu />
            <button className="btn btn-primary ml-1" onClick={() => dispatch({ type: "tour", step: 0 })}><Play size={15} /> Demo</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] space-y-4 px-4 pb-10 pt-5 sm:px-6">
        <FilterBar />
        <Kpis />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
          <MapCard />
          <RankedTable />
        </div>
        {state.filters.view === "opportunities" && <SelectedCards />}
        <Insights />
        <footer className="pt-1 text-[12px] text-fg-3">
          Sources: SCRTP DESC Planned Transmission Projects $2M+ (2024–2028) · Georgia Power 2025 IRP Technical Appendix Vol. 3 (public disclosure) · OpenStreetMap · Esri. Public data only; nothing marked CEII is used. Estimates are decision aids, not engineering conclusions.
        </footer>
      </main>
    </div>
  );
}

function Select<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="block min-w-0">
      <span className="label block">{label}</span>
      <select
        className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-line bg-ink-2 px-2.5 text-[13.5px] text-fg outline-none transition-colors hover:border-line-strong focus-visible:border-t3"
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o.v) === e.target.value)!.v)}
      >
        {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.label}</option>)}
      </select>
    </label>
  );
}

const YEARS = ["all", ...Array.from({ length: 11 }, (_, i) => String(2024 + i))];

function FilterBar() {
  const { state, dispatch } = useStore();
  const f = state.filters;
  const set = (patch: Partial<typeof f>) => dispatch({ type: "filters", patch });
  const adv = state.advanced;
  const advancedOn = adv.method !== "closest" || adv.region !== "all" || adv.timing !== "any";
  return (
    <section className="panel grid grid-cols-2 items-end gap-3 p-3.5 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]" aria-label="Filters">
      <Select<UtilityFilter> label="Utility" value={f.utility} onChange={(v) => set({ utility: v })} options={[
        { v: "both", label: "Both utilities" }, { v: "DESC", label: "Dominion Energy SC" }, { v: "GPC", label: "Georgia Power" }, { v: "allGA", label: "+ Georgia co-planners" }]} />
      <Select label="Planned completion" value={f.year} onChange={(v) => set({ year: v })} options={YEARS.map((y) => ({ v: y, label: y === "all" ? "All years (2023–2034)" : y }))} />
      <Select<VoltageFilter> label="Voltage" value={f.voltage} onChange={(v) => set({ voltage: v })} options={[
        { v: "all", label: "All voltages" }, { v: "500", label: "500 kV" }, { v: "230", label: "230 kV" }, { v: "115", label: "115 kV" }, { v: "low", label: "Under 100 kV" }]} />
      <Select<Range> label="Distance" value={f.range} options={RANGES} onChange={(v) => set({ range: v })} />
      <Select<ViewMode> label="Show" value={f.view} onChange={(v) => set({ view: v })} options={[{ v: "opportunities", label: "Coordination opportunities" }, { v: "projects", label: "All projects" }]} />
      <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
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
    <div className="panel p-4">
      <div className="label flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} aria-hidden />{label}</div>
      <div className="num mt-1.5 text-[28px] font-semibold leading-none tracking-[-0.03em]">{value}{unit && <span className="ml-1 text-[15px] font-medium text-fg-2">{unit}</span>}</div>
      <div className="mt-2 truncate text-[12px] text-fg-3">{foot}</div>
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
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Summary">
      <Kpi label="Projects" value={visibleProjects.length} foot={`${s.desc} Dominion SC · ${s.ga} Georgia`} dot="var(--color-fg-3)" />
      <Kpi label="Projects close enough to coordinate" value={visiblePairs.length} foot={`cross-utility pairs · ${state.filters.range === 0.05 ? "touching" : `≤ ${state.filters.range} km`}`} dot="var(--color-t4)" />
      <Kpi label="Timeline matches" value={s.overlap + s.sync} foot={`${s.overlap} overlapping builds · ${s.sync} finish within 180 days`} dot="var(--color-t3)" />
      <Kpi label="Closest pair" value={cv} unit={cu} foot={c ? `${shortName(data.byId.get(c.a)!)} ↔ ${shortName(data.byId.get(c.b)!)}` : "—"} dot="var(--color-t1)" />
    </section>
  );
}

function MapCard() {
  const { state, dispatch, data } = useStore();
  const f = data.meta.funnel;
  const unlocated = f.desc_projects + f.ga_projects - f.located_desc - f.located_ga;
  return (
    <section className="panel flex h-[460px] flex-col overflow-hidden lg:h-[620px]" aria-label="Project map">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold">{state.filters.view === "projects" ? "All projects" : "Projects close enough to coordinate"}</h2>
          <p className="text-[12px] text-fg-3">Hover to preview · click an arc or table row to select</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-fg-2">
          <Key c="var(--color-desc)" l="Dominion SC" filled />
          <Key c="var(--color-gpc)" l="Georgia Power" />
          <span className="inline-flex items-center gap-1.5"><svg width="18" height="6" aria-hidden><line x1="1" y1="3" x2="17" y2="3" stroke="var(--color-fg-2)" strokeWidth="2.2" strokeDasharray="3 2" /></svg>Approximate route</span>
          {state.month && <button className="chip bg-t3/15 text-t3" onClick={() => dispatch({ type: "month", month: null })}>Only {monthYear(state.month)} ✕</button>}
          <div className="seg" role="group" aria-label="Basemap">
            <button aria-pressed={state.basemap === "dark"} onClick={() => dispatch({ type: "basemap", basemap: "dark" })}>Map</button>
            <button aria-pressed={state.basemap === "satellite"} onClick={() => dispatch({ type: "basemap", basemap: "satellite" })}>Satellite</button>
          </div>
          <button className={`btn h-8 px-2 ${state.showGrid ? "is-on" : ""}`} aria-pressed={state.showGrid} onClick={() => dispatch({ type: "grid", on: !state.showGrid })} aria-label="Show existing 115–500 kV lines" title="Existing 115–500 kV lines">
            <Layers size={15} />
          </button>
        </div>
      </div>
      <div className="relative flex-1">
        <MapView />
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-line bg-ink-1/95">
          <button className="grid h-8 w-8 place-items-center hover:bg-ink-3" onClick={() => flyTo({ kind: "zoom", dir: 1 })} aria-label="Zoom in"><Plus size={16} /></button>
          <button className="grid h-8 w-8 place-items-center border-t border-line hover:bg-ink-3" onClick={() => flyTo({ kind: "zoom", dir: -1 })} aria-label="Zoom out"><Minus size={16} /></button>
        </div>
        <div className="absolute left-3 top-3 z-10 flex gap-1">
          {(["Savannah", "Augusta"] as const).map((r) => (
            <button key={r} className="rounded-lg border border-line bg-ink-1/95 px-2.5 py-1 text-[12px] text-fg-2 hover:text-fg" onClick={() => flyTo({ kind: "region", name: r })}>{r}</button>
          ))}
          <button className="rounded-lg border border-line bg-ink-1/95 px-2.5 py-1 text-[12px] text-fg-2 hover:text-fg" onClick={() => flyTo({ kind: "region", name: "southeast" })}>Whole border</button>
        </div>
        <TierKey />
      </div>
      <p className="border-t border-line px-4 py-2 text-[11.5px] text-fg-3">
        <b className="font-medium text-fg-2">Limitations:</b> most routes are drawn straight between named endpoints, so distances are estimates · {unlocated} projects could not be located · Georgia costs are redacted in the filing.
      </p>
    </section>
  );
}

function Key({ c, l, filled = false }: { c: string; l: string; filled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="22" height="10" aria-hidden>
        <line x1="1" y1="5" x2="15" y2="5" stroke={c} strokeWidth="2.5" />
        <circle cx="17" cy="5" r="3.2" fill={filled ? c : "var(--color-ink-1)"} stroke={c} strokeWidth="1.8" />
      </svg>
      {l}
    </span>
  );
}

function TierKey() {
  const items = [["#ff4d6d", "Touching"], ["#ff9f1c", "< 1.6 km"], ["#ffd23f", "< 8 km"], ["#4cc9f0", "< 40 km"]];
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-ink-0/85 px-3 py-2 text-[11.5px] text-fg-2" aria-hidden>
      {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: c }} />{l}</span>)}
      <span className="text-fg-3">· solid arc = builds overlap</span>
    </div>
  );
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
      <button className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}><Download size={16} /><span className="hidden sm:inline">Export</span></button>
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
