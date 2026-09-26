import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import { loadGrid, loadStates } from "../data/load";
import { UTILITY_COLOR, UTILITY_NAME, monthNum, shortName } from "../data/format";
import { activeMapPair, measurementCoordinates, measurementLayer, UTILITY_SYMBOLS, utilitySymbol } from "../data/mapPresentation";
import type { Dataset, Project } from "../data/types";
import { useStore } from "../state/store";
import { PALETTE } from "../design/palette";
import { createMapStyle } from "../design/mapStyle";
import { REGION_VIEWS, registerCamera, type CameraTarget } from "./camera";

maplibregl.setWorkerUrl(workerUrl);

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: "FeatureCollection", features: [] };
/** Keep camera targets inside the geographic space between independent overlays. */
function workspacePadding(map: maplibregl.Map) {
  const root = map.getContainer().closest(".map-workspace");
  const rect = map.getContainer().getBoundingClientRect();
  const summary = root?.querySelector(".workspace-summary")?.getBoundingClientRect();
  const results = root?.querySelector(".results-panel.is-expanded")?.getBoundingClientRect();
  const inspector = root?.querySelector(".inspector-panel.is-expanded")?.getBoundingClientRect();
  const dock = root?.querySelector(".workspace-dock")?.getBoundingClientRect();
  const wide = rect.width >= 1280;
  return {
    top: Math.min((summary?.height ? summary.bottom - rect.top : 72) + 16, rect.height * 0.3),
    bottom: !wide && dock ? Math.min(rect.bottom - dock.top + 16, rect.height * 0.65) : 72,
    left: wide && results ? Math.min(results.right - rect.left + 24, rect.width * 0.34) : 24,
    right: wide && inspector ? Math.min(rect.right - inspector.left + 24, rect.width * 0.34) : 24,
  };
}

/** Render the same authored shapes used in the legend and result rows. */
function addMapSymbols(map: maplibregl.Map) {
  for (const symbol of Object.values(UTILITY_SYMBOLS)) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 40;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.translate(2, 2);
    const path = new Path2D(symbol.path);
    ctx.fillStyle = symbol.color;
    ctx.strokeStyle = PALETTE["ink-1"];
    ctx.lineWidth = 1.5;
    ctx.fill(path);
    ctx.stroke(path);
    map.addImage(symbol.id, ctx.getImageData(0, 0, 40, 40), { pixelRatio: 2 });
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.moveTo(16, 5); ctx.lineTo(16, 27);
  ctx.moveTo(5, 16); ctx.lineTo(27, 16);
  ctx.strokeStyle = PALETTE["ink-1"]; ctx.lineWidth = 8; ctx.stroke();
  ctx.strokeStyle = PALETTE["map-measure"]; ctx.lineWidth = 4; ctx.stroke();
  map.addImage("measurement-tick", ctx.getImageData(0, 0, 32, 32), { pixelRatio: 2 });
}

function geometryOf(p: Project): GeoJSON.Geometry | null {
  if (!p.located || !p.path.length) return null;
  if (p.geom_type === "line") return p.route?.length ? { type: "MultiLineString", coordinates: p.route } : { type: "LineString", coordinates: p.path };
  return { type: "Point", coordinates: p.path[0] };
}

function projectLayers(projects: Project[], hot: Set<string>, sel: Set<string>) {
  const lines: GeoJSON.Feature[] = [], points: GeoJSON.Feature[] = [], ends: GeoJSON.Feature[] = [];
  const any = sel.size > 0;
  for (const p of projects) {
    const g = geometryOf(p);
    if (!g) continue;
    const props = {
      id: p.id,
      color: UTILITY_COLOR[p.utility],
      symbol: utilitySymbol(p.utility).id,
      approx: p.route?.length ? 0 : 1,
      emph: sel.has(p.id) ? 3 : any ? 0 : hot.has(p.id) ? 2 : 1,
      s: p.window[0] ? monthNum(p.window[0]) : 0,
      e: p.window[1] ? monthNum(p.window[1]) : 99999,
      label: `${UTILITY_NAME[p.utility]} · ${shortName(p)}`,
    };
    (g.type === "Point" ? points : lines).push({ type: "Feature", id: p.id, geometry: g, properties: props });
    for (const e of g.type === "Point" ? [] : p.endpoints)
      if (e.lat != null && e.lon != null) ends.push({ type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] }, properties: props });
  }
  const fc = (f: GeoJSON.Feature[]): FC => ({ type: "FeatureCollection", features: f });
  return { lines: fc(lines), points: fc(points), ends: fc(ends) };
}

export default function MapView() {
  const { state, dispatch, data, visiblePairs, visibleProjects } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; node: React.ReactNode } | null>(null);
  const reduced = useRef(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const spin = useRef(!reduced.current);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<Dataset>(data);
  dataRef.current = data;

  useEffect(() => {
    if (!box.current) return;
    const start = reduced.current ? REGION_VIEWS.southeast : REGION_VIEWS.globe;
    const map = new maplibregl.Map({
      container: box.current, style: createMapStyle(), ...start, maxPitch: 70,
      attributionControl: { compact: true }, canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __gl: maplibregl.Map }).__gl = map;

    map.on("load", async () => {
      map.addSource("states", { type: "geojson", data: await loadStates().catch(() => EMPTY) });
      addMapSymbols(map);
      for (const id of ["grid", "plines", "ppoints", "ends", "measure"]) map.addSource(id, { type: "geojson", data: EMPTY, promoteId: "id" });

      const emphOpacity = (on: number, hot: number, base: number, off: number): maplibregl.ExpressionSpecification =>
        ["match", ["get", "emph"], 3, on, 2, hot, 1, base, off];
      map.addLayer({ id: "grid", type: "line", source: "grid", minzoom: 5, paint: { "line-color": PALETTE["map-grid"], "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 10, 1], "line-opacity": 0.22 } });
      map.addLayer({ id: "states", type: "line", source: "states", paint: { "line-color": PALETTE["map-boundary"], "line-opacity": 0.35, "line-width": 1.2, "line-dasharray": [3, 2] } });
      const width: maplibregl.ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 5, ["match", ["get", "emph"], 3, 3.5, 2, 2.2, 1.4], 11, ["match", ["get", "emph"], 3, 6, 2, 3.4, 2]];
      for (const approx of [0, 1]) map.addLayer({ id: `route-casing-${approx}`, type: "line", source: "plines",
        filter: ["all", ["==", ["get", "emph"], 3], ["==", ["get", "approx"], approx]],
        layout: { "line-join": "round" },
        paint: { "line-color": PALETTE["ink-1"], "line-width": ["interpolate", ["linear"], ["zoom"], 5, 6.5, 11, 9], ...(approx ? { "line-dasharray": [2.2, 1.4] } : {}) } });
      map.addLayer({ id: "plines", type: "line", source: "plines", filter: ["==", ["get", "approx"], 0], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": width, "line-opacity": emphOpacity(1, 0.95, 0.9, 0.24) } });
      map.addLayer({ id: "plines-approx", type: "line", source: "plines", filter: ["==", ["get", "approx"], 1], layout: { "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": width, "line-opacity": emphOpacity(1, 0.95, 0.9, 0.24), "line-dasharray": [2.2, 1.4] } });
      for (const id of ["ppoints", "ends"]) map.addLayer({ id, type: "symbol", source: id,
        layout: { "icon-image": ["get", "symbol"], "icon-size": id === "ends" ? ["match", ["get", "emph"], 3, 0.85, 0.6] : ["match", ["get", "emph"], 3, 1.25, 2, 1.05, 0.85], "icon-allow-overlap": true, "icon-ignore-placement": true },
        paint: { "icon-opacity": emphOpacity(1, 1, 0.8, 0.3) } });
      map.addLayer({ id: "measure-casing", type: "line", source: "measure", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": PALETTE["ink-1"], "line-width": 5 } });
      map.addLayer({ id: "measure", type: "line", source: "measure", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": PALETTE["map-measure"], "line-width": 2 } });
      map.addLayer({ id: "measure-pts", type: "symbol", source: "measure", filter: ["==", ["get", "kind"], "endpoint"],
        layout: { "icon-image": "measurement-tick", "icon-allow-overlap": true, "icon-ignore-placement": true } });
      map.addLayer({ id: "measure-label", type: "symbol", source: "measure", filter: ["==", ["get", "kind"], "label"],
        layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 14, "text-offset": [0, -1.5], "text-max-width": 18, "text-allow-overlap": true },
        paint: { "text-color": PALETTE["map-measure"], "text-halo-color": PALETTE["ink-1"], "text-halo-width": 3 } });
      map.addLayer({ id: "sel-label", type: "symbol", source: "plines", filter: ["==", ["get", "emph"], 3],
        layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 12.5, "text-offset": [0, 1.1], "text-allow-overlap": true },
        paint: { "text-color": ["get", "color"], "text-halo-color": PALETTE["ink-1"], "text-halo-width": 2 } });
      map.addLayer({ id: "sel-label-pt", type: "symbol", source: "ppoints", filter: ["==", ["get", "emph"], 3],
        layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 12.5, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true },
        paint: { "text-color": ["get", "color"], "text-halo-color": PALETTE["ink-1"], "text-halo-width": 2 } });

      const hit = ["plines", "plines-approx", "ppoints", "ends"];
      // A 24px hit area makes narrow lines and small endpoints easier to pick.
      const featureAt = (point: maplibregl.Point) => map.queryRenderedFeatures(
        [[point.x - 12, point.y - 12], [point.x + 12, point.y + 12]], { layers: hit },
      )[0];
      map.on("mousemove", (ev) => {
        const f = featureAt(ev.point);
        map.getCanvas().style.cursor = f ? "pointer" : "";
        if (!f) {
          setTip(null);
          dispatch({ type: "hover", id: null });
          return;
        }
        const id = f.properties?.id as string;
        dispatch({ type: "hover", id });
        const d = dataRef.current;
        const p = d.byId.get(id);
        if (p) setTip({ x: ev.point.x, y: ev.point.y, node: <ProjectTip p={p} /> });
      });
      map.on("mouseout", () => {
        setTip(null);
        dispatch({ type: "hover", id: null });
      });
      map.on("click", (ev) => {
        const f = featureAt(ev.point);
        if (!f) return;
        const id = f.properties?.id as string;
        dispatch({ type: "selectProject", id });
      });
      for (const ev of ["mousedown", "wheel", "touchstart"] as const) map.on(ev, () => {
        spin.current = false;
        if (introTimer.current) clearTimeout(introTimer.current);
      });

      setReady(true);
      if (!reduced.current)
        introTimer.current = setTimeout(() => {
          spin.current = false;
          map.flyTo({ ...REGION_VIEWS.southeast, padding: workspacePadding(map), duration: 2600, curve: 1.6 });
        }, 700);
      loadGrid()
        .then((g) =>
          (map.getSource("grid") as maplibregl.GeoJSONSource | undefined)?.setData({
            type: "FeatureCollection",
            features: g.map((l) => ({ type: "Feature", geometry: { type: "LineString", coordinates: l.p }, properties: { kv: l.kv } })),
          }),
        )
        .catch(() => undefined);
    });
    return () => {
      if (introTimer.current) clearTimeout(introTimer.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* globe spin during the opening, before the fly-in */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    let raf = 0;
    const tick = () => {
      if (!spin.current) return;
      raf = requestAnimationFrame(tick);
      if (!map.isMoving()) map.setCenter([map.getCenter().lng + 0.08, map.getCenter().lat]);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  /* camera bridge */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const dur = (ms: number) => (reduced.current ? 0 : ms);
    registerCamera((t: CameraTarget) => {
      spin.current = false;
      if (introTimer.current) clearTimeout(introTimer.current);
      if (t.kind === "zoom") {
        if (t.dir > 0) map.zoomIn();
        else map.zoomOut();
        return;
      }
      if (t.kind === "region") {
        map.flyTo({ ...REGION_VIEWS[t.name], padding: workspacePadding(map), duration: dur(1400) });
        return;
      }
      const ids = t.kind === "pair" ? (() => { const p = data.pairById.get(t.id); return p ? [p.a, p.b] : []; })() : [t.id];
      const coords = ids.flatMap((id) => { const p = data.byId.get(id); return p ? (p.route?.length ? p.route.flat() : p.path) : []; }) as [number, number][];
      if (!coords.length) return;
      const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => b.extend(c));
      // fitBounds adds its padding to the map's existing edge padding.
      map.setPadding(workspacePadding(map));
      map.fitBounds(b, { padding: 0, maxZoom: 11.5, pitch: 35, bearing: -15, duration: dur(1200) });
    });
    return () => registerCamera(null);
  }, [ready, data]);

  /* data sync */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const byView = state.filters.view === "projects";
    const active = byView ? null : activeMapPair(visiblePairs, state.hovered, state.selectedProject ? null : state.selected, state.month);
    const hot = new Set(visiblePairs.flatMap((p) => [p.a, p.b]));
    const selSet = new Set(active ? [active.a, active.b] : state.selectedProject ? [state.selectedProject] : []);
    const shown = byView ? visibleProjects : visibleProjects.filter((p) => hot.has(p.id) || selSet.has(p.id));
    const hoveredProject = state.hovered && data.byId.has(state.hovered) ? new Set([state.hovered]) : new Set<string>();
    const pl = projectLayers(shown, hoveredProject, selSet);
    (map.getSource("plines") as maplibregl.GeoJSONSource).setData(pl.lines);
    (map.getSource("ppoints") as maplibregl.GeoJSONSource).setData(pl.points);
    (map.getSource("ends") as maplibregl.GeoJSONSource).setData(pl.ends);
    (map.getSource("measure") as maplibregl.GeoJSONSource).setData(measurementLayer(active, state.advanced.method, data.byId));
  }, [ready, data, visiblePairs, visibleProjects, state.selected, state.selectedProject, state.hovered, state.month, state.filters.view, state.advanced.method]);

  /* Explicit selections and shared pair links frame the selected geometry. */
  useEffect(() => {
    if (!ready || !state.selected || state.selectedProject || state.filters.view === "projects") return;
    const p = data.pairById.get(state.selected);
    if (!p) return;
    const coords = [p.a, p.b].flatMap((id) => { const x = data.byId.get(id)!; return x.route?.length ? x.route.flat() : x.path; }) as [number, number][];
    coords.push(...(measurementCoordinates(p, state.advanced.method, data.byId) ?? []));
    const map = mapRef.current!;
    if (!coords.length) return;
    const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    coords.forEach((c) => b.extend(c));
    spin.current = false;
    if (introTimer.current) clearTimeout(introTimer.current);
    map.setPadding(workspacePadding(map));
    map.fitBounds(b, { padding: 0, maxZoom: 11.5, pitch: 35, bearing: p.region === "Augusta" ? 15 : -18, duration: reduced.current ? 0 : 1200 });
  }, [ready, state.selected, state.selectedProject, state.filters.view, state.advanced.method, data]);

  /* Reframe the available map area when a sheet opens or the viewport changes. */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const update = () => map.setPadding(workspacePadding(map));
    update();
    map.on("resize", update);
    return () => { map.off("resize", update); };
  }, [ready, state.resultsOpen, state.analysisOpen]);

  /* month filter */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const m = state.month ? monthNum(state.month) : null;
    const pf: maplibregl.FilterSpecification | null = m != null ? ["all", ["<=", ["get", "s"], m], [">=", ["get", "e"], m]] : null;
    map.setFilter("plines", pf ? ["all", ["==", ["get", "approx"], 0], pf] : ["==", ["get", "approx"], 0]);
    map.setFilter("plines-approx", pf ? ["all", ["==", ["get", "approx"], 1], pf] : ["==", ["get", "approx"], 1]);
    for (const id of ["ppoints", "ends"]) map.setFilter(id, pf);
    for (const approx of [0, 1]) map.setFilter(`route-casing-${approx}`, ["all", ["==", ["get", "emph"], 3], ["==", ["get", "approx"], approx], ...(pf ? [pf] : [])]);
    for (const id of ["sel-label", "sel-label-pt"]) map.setFilter(id, ["all", ["==", ["get", "emph"], 3], ...(pf ? [pf] : [])]);
  }, [ready, state.month]);

  /* basemap + grid */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    map.setLayoutProperty("sat", "visibility", state.basemap === "satellite" ? "visible" : "none");
    for (const layer of map.getStyle().layers) {
      if (layer.id.startsWith("terrain-")) map.setLayoutProperty(layer.id, "visibility", state.basemap === "dark" ? "visible" : "none");
    }
    map.setLayoutProperty("grid", "visibility", state.showGrid ? "visible" : "none");
  }, [ready, state.basemap, state.showGrid]);

  const active = state.filters.view === "projects" ? null : activeMapPair(visiblePairs, state.hovered, state.selectedProject ? null : state.selected, state.month);
  const unavailable = active && !measurementCoordinates(active, state.advanced.method, data.byId);

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" role="region" aria-label="Map of planned transmission projects in Georgia and South Carolina" aria-describedby="map-instructions" />
      <p id="map-instructions" className="sr-only">Use the Results list to explore projects and compare pairs with the keyboard. Focus a pair to preview its distance; activate it to select. The Map key explains symbols and routes.</p>
      {unavailable && <p className="map-unavailable map-surface">Unavailable on map: measurement coordinates are missing.</p>}
      {tip && (
        <div className="pointer-events-none absolute z-30 max-w-[300px] rounded-xl border border-line bg-ink-1/95 px-3 py-2 text-[12.5px] shadow-[var(--shadow-panel)]" style={{ left: Math.max(8, Math.min(tip.x + 14, (box.current?.clientWidth ?? 320) - 308)), top: Math.max(8, Math.min(tip.y + 12, (box.current?.clientHeight ?? 240) - 120)) }}>
          {tip.node}
        </div>
      )}
    </div>
  );
}

function ProjectTip({ p }: { p: Project }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold" style={{ color: UTILITY_COLOR[p.utility] }}>{UTILITY_NAME[p.utility]}{p.voltage_kv ? ` · ${p.voltage_kv} kV` : ""}</div>
      <div>{shortName(p)}</div>
      <div className="num text-fg-3">in service {p.in_service?.slice(0, 7) ?? "—"} · {p.route?.length ? "mapped route" : "approximate"}</div>
    </div>
  );
}
