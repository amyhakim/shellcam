import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "../data/savings";
import type { Dataset, Pair, Project } from "../data/types";

export type Method = "closest" | "guide";
export type Status = "identified" | "contacted" | "meeting" | "agreed";
export const STATUSES: { id: Status; label: string }[] = [
  { id: "identified", label: "Identified" },
  { id: "contacted", label: "Contacted" },
  { id: "meeting", label: "Meeting set" },
  { id: "agreed", label: "Agreed" },
];

export type Range = 40 | 8 | 1.6 | 0.05;
export const RANGES: { v: Range; label: string }[] = [
  { v: 40, label: "Within 40 km" },
  { v: 8, label: "Within 8 km" },
  { v: 1.6, label: "Within 1.6 km" },
  { v: 0.05, label: "Touching" },
];
export type UtilityFilter = "both" | "DESC" | "GPC" | "allGA";
export type VoltageFilter = "all" | "low" | "115" | "230" | "500";
export type ViewMode = "opportunities" | "projects";
export type WorkspacePanel = "results" | "details" | "insights";

/** The five primary filters (spec 4.4). */
export interface Filters {
  utility: UtilityFilter;
  year: string; // "all" | "2024" … "2034": planned completion year
  voltage: VoltageFilter;
  range: Range;
  view: ViewMode;
}
/** Methodology settings, shown only on request. */
export interface Advanced {
  method: Method;
  region: "all" | "Savannah" | "Augusta" | "Other";
  timing: "any" | "concurrent";
}
const DEFAULT_FILTERS: Filters = { utility: "both", year: "all", voltage: "all", range: 40, view: "opportunities" };
const DEFAULT_ADVANCED: Advanced = { method: "closest", region: "all", timing: "any" };

export type Drawer = null | "source" | "method";

export interface State {
  filters: Filters;
  advanced: Advanced;
  selected: string | null; // pair id
  selectedProject: string | null; // in "all projects" view
  hovered: string | null; // pair or project id, synced map <-> table
  month: string | null;
  basemap: "satellite" | "dark";
  showGrid: boolean;
  drawer: Drawer;
  tourStep: number | null;
  palette: boolean;
  analysisPanel: "details" | "insights";
  resultsOpen: boolean;
  analysisOpen: boolean;
  assumptions: Assumptions;
  status: Record<string, Status>;
}

export type Action =
  | { type: "filters"; patch: Partial<Filters> }
  | { type: "advanced"; patch: Partial<Advanced> }
  | { type: "resetFilters" }
  | { type: "select"; id: string | null; reveal?: boolean }
  | { type: "selectProject"; id: string | null; reveal?: boolean }
  | { type: "hover"; id: string | null }
  | { type: "month"; month: string | null }
  | { type: "basemap"; basemap: State["basemap"] }
  | { type: "grid"; on: boolean }
  | { type: "drawer"; drawer: Drawer }
  | { type: "tour"; step: number | null }
  | { type: "palette"; on: boolean }
  | { type: "workspace"; panel: WorkspacePanel; open?: boolean }
  | { type: "assumption"; key: keyof Assumptions; value: number }
  | { type: "resetAssumptions" }
  | { type: "status"; id: string; status: Status };

const LS = "gridlock.v2";
function loadLocal(): Pick<State, "status" | "assumptions"> {
  try {
    const j = JSON.parse(localStorage.getItem(LS) ?? "{}");
    return { status: j.status ?? {}, assumptions: { ...DEFAULT_ASSUMPTIONS, ...(j.assumptions ?? {}) } };
  } catch {
    return { status: {}, assumptions: DEFAULT_ASSUMPTIONS };
  }
}

function fromHash(): Partial<State> {
  const q = new URLSearchParams(location.hash.replace(/^#\/?\??/, ""));
  const out: Partial<State> = {};
  if (q.get("pair")) out.selected = q.get("pair");
  if (q.get("drawer") === "source" || q.get("drawer") === "method") out.drawer = q.get("drawer") as Drawer;
  return out;
}

export function initialState(): State {
  return {
    filters: DEFAULT_FILTERS,
    advanced: DEFAULT_ADVANCED,
    selected: null,
    selectedProject: null,
    hovered: null,
    month: null,
    basemap: "dark",
    showGrid: false,
    drawer: null,
    tourStep: null,
    palette: false,
    analysisPanel: "details",
    resultsOpen: typeof matchMedia !== "undefined" && matchMedia("(min-width: 760px)").matches,
    analysisOpen: !!fromHash().selected || (typeof matchMedia !== "undefined" && matchMedia("(min-width: 1280px)").matches),
    ...loadLocal(),
    ...fromHash(),
  };
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "filters":
      return { ...s, filters: { ...s.filters, ...a.patch }, ...(a.patch.view ? { resultsOpen: true } : {}) };
    case "advanced":
      return { ...s, advanced: { ...s.advanced, ...a.patch } };
    case "resetFilters":
      return { ...s, filters: DEFAULT_FILTERS, advanced: DEFAULT_ADVANCED, month: null, selectedProject: null };
    case "select":
      return { ...s, selected: a.id, selectedProject: null, palette: false,
        ...(a.reveal === false ? {} : { analysisPanel: s.analysisOpen ? s.analysisPanel : "details" as const, analysisOpen: true }) };
    case "selectProject":
      return { ...s, selectedProject: a.id, palette: false,
        ...(a.reveal === false ? {} : { analysisPanel: s.analysisOpen ? s.analysisPanel : "details" as const, analysisOpen: true }) };
    case "hover":
      return s.hovered === a.id ? s : { ...s, hovered: a.id };
    case "month":
      return { ...s, month: a.month };
    case "basemap":
      return { ...s, basemap: a.basemap };
    case "grid":
      return { ...s, showGrid: a.on };
    case "drawer":
      return { ...s, drawer: a.drawer, palette: false };
    case "tour":
      return { ...s, tourStep: a.step, palette: false };
    case "palette":
      return { ...s, palette: a.on };
    case "workspace":
      return a.panel === "results"
        ? { ...s, resultsOpen: a.open ?? true }
        : { ...s, analysisPanel: a.panel, analysisOpen: a.open ?? true };
    case "assumption":
      return { ...s, assumptions: { ...s.assumptions, [a.key]: a.value } };
    case "resetAssumptions":
      return { ...s, assumptions: DEFAULT_ASSUMPTIONS };
    case "status":
      return { ...s, status: { ...s.status, [a.id]: a.status } };
  }
}

interface Ctx {
  state: State;
  dispatch: Dispatch<Action>;
  data: Dataset;
  visiblePairs: Pair[];
  visibleProjects: Project[];
}
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ data, children }: { data: Dataset; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    try {
      localStorage.setItem(LS, JSON.stringify({ status: state.status, assumptions: state.assumptions }));
    } catch {
      /* private mode: preferences just won't persist */
    }
  }, [state.status, state.assumptions]);

  useEffect(() => {
    if (location.hash.startsWith("#/brief/")) return;
    const q = new URLSearchParams();
    if (state.selected) q.set("pair", state.selected);
    if (state.drawer) q.set("drawer", state.drawer);
    const h = q.toString() ? `#/?${q}` : "";
    if (location.hash !== h) history.replaceState(null, "", h || location.pathname);
  }, [state.selected, state.drawer]);

  const visibleProjects = useMemo(() => filterProjects(data, state), [data, state]);
  const visiblePairs = useMemo(() => filterPairs(data, state), [data, state]);

  // Start with the whole network; filtered-out selections must not leave stale evidence.
  useEffect(() => {
    if (state.selected && !visiblePairs.some((p) => p.id === state.selected)) dispatch({ type: "select", id: null, reveal: false });
  }, [visiblePairs, state.selected]);
  useEffect(() => {
    if (state.selectedProject && !visibleProjects.some((p) => p.id === state.selectedProject)) dispatch({ type: "selectProject", id: null, reveal: false });
  }, [visibleProjects, state.selectedProject]);

  const value = useMemo(() => ({ state, dispatch, data, visiblePairs, visibleProjects }), [state, data, visiblePairs, visibleProjects]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}

const GA = new Set(["GPC", "GTC", "MEAG", "DU"]);
function utilityOk(p: Project, u: UtilityFilter) {
  if (u === "DESC") return p.utility === "DESC";
  if (u === "GPC") return p.utility === "GPC";
  if (u === "allGA") return p.utility === "DESC" || GA.has(p.utility);
  return p.utility === "DESC" || p.utility === "GPC";
}
function yearOk(p: Project, y: string) {
  return y === "all" || (p.in_service ?? "").startsWith(y);
}
function voltageOk(p: Project, v: VoltageFilter) {
  if (v === "all") return true;
  if (v === "low") return p.kv.some((k) => k < 100);
  return p.kv.includes(Number(v));
}

export function filterProjects(data: Dataset, s: State): Project[] {
  const f = s.filters;
  return data.projects.filter((p) => utilityOk(p, f.utility) && yearOk(p, f.year) && voltageOk(p, f.voltage) &&
    (s.advanced.region === "all" || p.region === s.advanced.region));
}

export function filterPairs(data: Dataset, s: State): Pair[] {
  const f = s.filters, adv = s.advanced;
  const out = data.pairs.filter((p) => {
    const km = adv.method === "closest" ? p.km : p.center_mi * 1.609;
    if (adv.method === "closest" ? !p.tier : !p.guide_flag) return false;
    if (km > f.range + 1e-9) return false;
    if (f.utility !== "allGA" && p.b_utility !== "GPC") return false;
    if (adv.region !== "all" && p.region !== adv.region) return false;
    if (adv.timing === "concurrent" && p.timeline !== "concurrent") return false;
    const a = data.byId.get(p.a)!, b = data.byId.get(p.b)!;
    if (!(yearOk(a, f.year) || yearOk(b, f.year))) return false;
    if (!(voltageOk(a, f.voltage) || voltageOk(b, f.voltage))) return false;
    return true;
  });
  if (adv.method === "guide") out.sort((x, y) => x.center_mi - y.center_mi);
  return out;
}
