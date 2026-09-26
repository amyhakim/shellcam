import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import { loadGrid, loadStates } from "../data/load";
import { TIER, UTILITY_COLOR, UTILITY_NAME, kmLabel, monthNum, shortName } from "../data/format";
import type { Dataset, Pair, Project } from "../data/types";
import { useStore } from "../state/store";
import { REGION_VIEWS, registerCamera, type CameraTarget } from "./camera";

maplibregl.setWorkerUrl(workerUrl);

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: "FeatureCollection", features: [] };
const PAD = { top: 60, bottom: 60, left: 60, right: 60 };

const ESRI_IMG = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_DARK = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const ESRI_PLACES = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

function style(): maplibregl.StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sky: {
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 0.8, 8, 0],
      "sky-color": "#0c1016",
      "horizon-color": "#1b2a44",
      "fog-color": "#0c1016",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.2,
    },
    sources: {
      sat: { type: "raster", tiles: [ESRI_IMG], tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
      dark: { type: "raster", tiles: [ESRI_DARK], tileSize: 256, maxzoom: 16, attribution: "Basemap © Esri" },
      labels: { type: "raster", tiles: [ESRI_PLACES], tileSize: 256, maxzoom: 16, attribution: "Places © Esri" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0c1016" } },
      { id: "dark", type: "raster", source: "dark", paint: { "raster-brightness-max": 0.85, "raster-contrast": -0.1 } },
      { id: "sat", type: "raster", source: "sat", layout: { visibility: "none" }, paint: { "raster-brightness-max": 0.5, "raster-saturation": -0.45 } },
      { id: "labels", type: "raster", source: "labels", minzoom: 4, paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.3, 8, 0.6] } },
    ],
  };
}

function arc(a: [number, number], b: [number, number], bend = 0.22, n = 28): [number, number][] {
  const [x1, y1] = a, [x2, y2] = b;
  const cx = (x1 + x2) / 2 - (y2 - y1) * bend, cy = (y1 + y2) / 2 + (x2 - x1) * bend;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [(1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2, (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2] as [number, number];
  });
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
      desc: p.utility === "DESC" ? 1 : 0,
      approx: p.route?.length ? 0 : 1,
      emph: sel.has(p.id) ? 3 : any ? 0 : hot.has(p.id) ? 2 : 1,
      s: p.window[0] ? monthNum(p.window[0]) : 0,
      e: p.window[1] ? monthNum(p.window[1]) : 99999,
      label: shortName(p),
    };
    (g.type === "Point" ? points : lines).push({ type: "Feature", id: p.id, geometry: g, properties: props });
    for (const e of p.endpoints)
      if (e.lat != null && e.lon != null) ends.push({ type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] }, properties: props });
  }
  const fc = (f: GeoJSON.Feature[]): FC => ({ type: "FeatureCollection", features: f });
  return { lines: fc(lines), points: fc(points), ends: fc(ends) };
}

function pairLayers(pairs: Pair[], selected: string | null, method: "closest" | "guide") {
  const arcs: GeoJSON.Feature[] = [], halos: GeoJSON.Feature[] = [];
  for (const p of pairs) {
    const tier = p.tier ?? 4;
    const props = { id: p.id, color: TIER[tier as 1].color, tier, sel: p.id === selected ? 1 : 0, dim: selected && p.id !== selected ? 1 : 0,
      concurrent: p.timeline === "concurrent" ? 1 : 0, os: p.overlap_window ? monthNum(p.overlap_window[0]) : -1, oe: p.overlap_window ? monthNum(p.overlap_window[1]) : -2 };
    const [a, b] = p.connector;
    if (p.km > 0.05 && p.id !== selected) arcs.push({ type: "Feature", id: p.id, geometry: { type: "LineString", coordinates: arc(a, b) }, properties: props });
    halos.push({ type: "Feature", id: p.id, geometry: { type: "Point", coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }, properties: props });
  }
  const sel = selected ? pairs.find((p) => p.id === selected) : null;
  const measure: FC = sel
    ? {
        type: "FeatureCollection",
        features: [
          { type: "Feature", geometry: { type: "LineString", coordinates: sel.connector }, properties: { label: `${kmLabel(sel, method)}${sel.measurement === "estimate" ? " (est.)" : ""}` } },
          ...sel.connector.map((c) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: c }, properties: {} })),
        ],
      }
    : EMPTY;
  return { arcs: { type: "FeatureCollection", features: arcs } as FC, halos: { type: "FeatureCollection", features: halos } as FC, measure };
}

export default function MapView() {
  const { state, dispatch, data, visiblePairs, visibleProjects } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; node: React.ReactNode } | null>(null);
  const reduced = useRef(typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const spin = useRef(!reduced.current);
  const dataRef = useRef<Dataset>(data);
  dataRef.current = data;

  useEffect(() => {
    if (!box.current) return;
    const start = reduced.current ? REGION_VIEWS.southeast : REGION_VIEWS.globe;
    const map = new maplibregl.Map({
      container: box.current, style: style(), ...start, maxPitch: 70,
      attributionControl: { compact: true }, canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __gl: maplibregl.Map }).__gl = map;

    map.on("load", async () => {
      map.addSource("states", { type: "geojson", data: await loadStates().catch(() => EMPTY) });
      for (const id of ["grid", "plines", "ppoints", "ends", "arcs", "halos", "measure"]) map.addSource(id, { type: "geojson", data: EMPTY, promoteId: "id" });

      const emphOpacity = (on: number, hot: number, base: number, off: number): maplibregl.ExpressionSpecification =>
        ["match", ["get", "emph"], 3, on, 2, hot, 1, base, off];
      map.addLayer({ id: "grid", type: "line", source: "grid", minzoom: 5, paint: { "line-color": "#7c8aa0", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 10, 1], "line-opacity": 0.22 } });
      map.addLayer({ id: "states", type: "line", source: "states", paint: { "line-color": "#e9edf3", "line-opacity": 0.35, "line-width": 1.2, "line-dasharray": [3, 2] } });
      map.addLayer({ id: "plines-glow", type: "line", source: "plines", filter: ["==", ["get", "emph"], 3], layout: { "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 12, "line-blur": 6, "line-opacity": 0.5 } });
      const width: maplibregl.ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 5, ["match", ["get", "emph"], 3, 3.5, 2, 2.2, 1.4], 11, ["match", ["get", "emph"], 3, 6, 2, 3.4, 2]];
      map.addLayer({ id: "plines", type: "line", source: "plines", filter: ["==", ["get", "approx"], 0], layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": width, "line-opacity": emphOpacity(1, 0.95, 0.5, 0.14) } });
      map.addLayer({ id: "plines-approx", type: "line", source: "plines", filter: ["==", ["get", "approx"], 1], layout: { "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": width, "line-opacity": emphOpacity(1, 0.95, 0.5, 0.14), "line-dasharray": [2.2, 1.4] } });
      map.addLayer({ id: "ppoints", type: "circle", source: "ppoints",
        paint: { "circle-radius": ["match", ["get", "emph"], 3, 8, 2, 5.5, 4], "circle-color": ["case", ["==", ["get", "desc"], 1], ["get", "color"], "#0c1016"],
          "circle-stroke-color": ["get", "color"], "circle-stroke-width": 2.2, "circle-opacity": emphOpacity(1, 1, 0.55, 0.15), "circle-stroke-opacity": emphOpacity(1, 1, 0.55, 0.15) } });
      // redundant encoding: Dominion endpoints filled, Georgia endpoints hollow
      map.addLayer({ id: "ends", type: "circle", source: "ends", minzoom: 7,
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 12, 5.5], "circle-color": ["case", ["==", ["get", "desc"], 1], ["get", "color"], "#0c1016"],
          "circle-stroke-color": ["get", "color"], "circle-stroke-width": 1.8, "circle-opacity": emphOpacity(1, 1, 0.5, 0.12), "circle-stroke-opacity": emphOpacity(1, 1, 0.5, 0.12) } });
      map.addLayer({ id: "arcs", type: "line", source: "arcs", layout: { "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-opacity": ["case", ["==", ["get", "dim"], 1], 0.18, ["==", ["get", "concurrent"], 1], 0.95, 0.55],
          "line-dasharray": ["case", ["==", ["get", "concurrent"], 1], ["literal", [1, 0]], ["literal", [2, 1.5]]] } });
      map.addLayer({ id: "halos", type: "circle", source: "halos",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 4, 10, 9], "circle-color": ["get", "color"], "circle-opacity": ["case", ["==", ["get", "dim"], 1], 0.05, 0.16],
          "circle-stroke-color": ["get", "color"], "circle-stroke-width": 1.3, "circle-stroke-opacity": ["case", ["==", ["get", "dim"], 1], 0.2, ["==", ["get", "sel"], 1], 0, 0.9] } });
      map.addLayer({ id: "measure", type: "line", source: "measure", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [1, 1.2] } });
      map.addLayer({ id: "measure-pts", type: "circle", source: "measure", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#0c1016", "circle-stroke-width": 2 } });
      map.addLayer({ id: "measure-label", type: "symbol", source: "measure", filter: ["==", ["geometry-type"], "LineString"],
        layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 13, "text-offset": [0, -1], "text-allow-overlap": true },
        paint: { "text-color": "#ffffff", "text-halo-color": "#0c1016", "text-halo-width": 2.2 } });
      map.addLayer({ id: "sel-label", type: "symbol", source: "plines", filter: ["==", ["get", "emph"], 3],
        layout: { "symbol-placement": "line-center", "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 12.5, "text-offset": [0, 1.1], "text-allow-overlap": true },
        paint: { "text-color": ["get", "color"], "text-halo-color": "#0c1016", "text-halo-width": 2 } });
      map.addLayer({ id: "sel-label-pt", type: "symbol", source: "ppoints", filter: ["==", ["get", "emph"], 3],
        layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Regular"], "text-size": 12.5, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true },
        paint: { "text-color": ["get", "color"], "text-halo-color": "#0c1016", "text-halo-width": 2 } });

      const hit = ["halos", "arcs", "plines", "plines-approx", "ppoints"];
      map.on("mousemove", (ev) => {
        const f = map.queryRenderedFeatures(ev.point, { layers: hit })[0];
        map.getCanvas().style.cursor = f ? "pointer" : "";
        if (!f) {
          setTip(null);
          dispatch({ type: "hover", id: null });
          return;
        }
        const id = f.properties?.id as string;
        dispatch({ type: "hover", id });
        const d = dataRef.current;
        if (f.layer.id === "halos" || f.layer.id === "arcs") {
          const p = d.pairById.get(id);
          if (p) setTip({ x: ev.point.x, y: ev.point.y, node: <PairTip p={p} a={d.byId.get(p.a)!} b={d.byId.get(p.b)!} /> });
        } else {
          const p = d.byId.get(id);
          if (p) setTip({ x: ev.point.x, y: ev.point.y, node: <ProjectTip p={p} /> });
        }
      });
      map.on("mouseout", () => {
        setTip(null);
        dispatch({ type: "hover", id: null });
      });
      map.on("click", (ev) => {
        const f = map.queryRenderedFeatures(ev.point, { layers: hit })[0];
        if (!f) return;
        const id = f.properties?.id as string;
        if (f.layer.id === "halos" || f.layer.id === "arcs") dispatch({ type: "select", id });
        else dispatch({ type: "selectProject", id });
      });
      for (const ev of ["mousedown", "wheel", "touchstart"] as const) map.on(ev, () => (spin.current = false));

      setReady(true);
      if (!reduced.current)
        setTimeout(() => {
          spin.current = false;
          map.flyTo({ ...REGION_VIEWS.southeast, duration: 4000, essential: true, curve: 1.6 });
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
      raf = requestAnimationFrame(tick);
      if (spin.current && !map.isMoving()) map.setCenter([map.getCenter().lng + 0.08, map.getCenter().lat]);
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
      if (t.kind === "zoom") {
        if (t.dir > 0) map.zoomIn();
        else map.zoomOut();
        return;
      }
      if (t.kind === "region") {
        map.flyTo({ ...REGION_VIEWS[t.name], duration: dur(2400), essential: true });
        return;
      }
      const ids = t.kind === "pair" ? (() => { const p = data.pairById.get(t.id); return p ? [p.a, p.b] : []; })() : [t.id];
      const coords = ids.flatMap((id) => { const p = data.byId.get(id); return p ? (p.route?.length ? p.route.flat() : p.path) : []; }) as [number, number][];
      if (!coords.length) return;
      const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => b.extend(c));
      const cam = map.cameraForBounds(b, { padding: PAD, maxZoom: 11.5 });
      if (cam) map.flyTo({ ...cam, pitch: 45, bearing: -15, duration: dur(1800), essential: true });
    });
    return () => registerCamera(null);
  }, [ready, data]);

  /* data sync */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const byView = state.filters.view === "projects";
    const sel = !byView && state.selected ? data.pairById.get(state.selected) : null;
    const hot = new Set(visiblePairs.flatMap((p) => [p.a, p.b]));
    const selSet = new Set(sel ? [sel.a, sel.b] : state.selectedProject ? [state.selectedProject] : []);
    const shown = byView ? visibleProjects : visibleProjects.filter((p) => hot.has(p.id) || selSet.has(p.id));
    const pl = projectLayers(shown, byView ? new Set(visibleProjects.map((p) => p.id)) : hot, selSet);
    const pr = byView ? { arcs: EMPTY, halos: EMPTY, measure: EMPTY } : pairLayers(visiblePairs, state.selected, state.advanced.method);
    (map.getSource("plines") as maplibregl.GeoJSONSource).setData(pl.lines);
    (map.getSource("ppoints") as maplibregl.GeoJSONSource).setData(pl.points);
    (map.getSource("ends") as maplibregl.GeoJSONSource).setData(pl.ends);
    (map.getSource("arcs") as maplibregl.GeoJSONSource).setData(pr.arcs);
    (map.getSource("halos") as maplibregl.GeoJSONSource).setData(pr.halos);
    (map.getSource("measure") as maplibregl.GeoJSONSource).setData(pr.measure);
  }, [ready, data, visiblePairs, visibleProjects, state.selected, state.selectedProject, state.filters.view, state.advanced.method]);

  /* user selection → camera (skip the automatic first selection so the fly-in plays) */
  const firstSel = useRef(true);
  useEffect(() => {
    if (!ready || !state.selected) return;
    if (firstSel.current) {
      firstSel.current = false;
      return;
    }
    const p = data.pairById.get(state.selected);
    if (!p) return;
    const coords = [p.a, p.b].flatMap((id) => { const x = data.byId.get(id)!; return x.route?.length ? x.route.flat() : x.path; }) as [number, number][];
    const map = mapRef.current!;
    const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    coords.forEach((c) => b.extend(c));
    const cam = map.cameraForBounds(b, { padding: PAD, maxZoom: 11.5 });
    spin.current = false;
    if (cam) map.flyTo({ ...cam, pitch: 45, bearing: p.region === "Augusta" ? 15 : -18, duration: reduced.current ? 0 : 1700, essential: true });
  }, [ready, state.selected, data]);

  /* month filter */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const m = state.month ? monthNum(state.month) : null;
    const pf: maplibregl.FilterSpecification | null = m != null ? ["all", ["<=", ["get", "s"], m], [">=", ["get", "e"], m]] : null;
    const of: maplibregl.FilterSpecification | null = m != null ? ["all", ["<=", ["get", "os"], m], [">=", ["get", "oe"], m]] : null;
    map.setFilter("plines", pf ? ["all", ["==", ["get", "approx"], 0], pf] : ["==", ["get", "approx"], 0]);
    map.setFilter("plines-approx", pf ? ["all", ["==", ["get", "approx"], 1], pf] : ["==", ["get", "approx"], 1]);
    for (const id of ["ppoints", "ends"]) map.setFilter(id, pf);
    for (const id of ["arcs", "halos"]) map.setFilter(id, of);
  }, [ready, state.month]);

  /* basemap + grid */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    map.setLayoutProperty("sat", "visibility", state.basemap === "satellite" ? "visible" : "none");
    map.setLayoutProperty("dark", "visibility", state.basemap === "dark" ? "visible" : "none");
    map.setLayoutProperty("grid", "visibility", state.showGrid ? "visible" : "none");
  }, [ready, state.basemap, state.showGrid]);

  /* hover sync from the table */
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!;
    const h = state.hovered ?? "";
    map.setPaintProperty("arcs", "line-width", ["case", ["==", ["get", "id"], h], 4, 1.6]);
    map.setPaintProperty("halos", "circle-stroke-width", ["case", ["==", ["get", "id"], h], 3.5, 1.3]);
    map.setFilter("plines-glow", ["any", ["==", ["get", "emph"], 3], ["==", ["get", "id"], h]]);
  }, [ready, state.hovered]);

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full" role="region" aria-label="Map of planned transmission projects in Georgia and South Carolina" />
      {tip && (
        <div className="pointer-events-none absolute z-30 max-w-[300px] rounded-xl border border-line bg-ink-1/95 px-3 py-2 text-[12.5px] shadow-[var(--shadow-panel)]" style={{ left: tip.x + 14, top: tip.y + 12 }}>
          {tip.node}
        </div>
      )}
    </div>
  );
}

function PairTip({ p, a, b }: { p: Pair; a: Project; b: Project }) {
  const t = TIER[(p.tier ?? 4) as 1];
  return (
    <div>
      <div className="num font-semibold" style={{ color: t.color }}>{kmLabel(p)} · {t.label}</div>
      <div><span style={{ color: UTILITY_COLOR[a.utility] }}>{shortName(a)}</span> ↔ <span style={{ color: UTILITY_COLOR[b.utility] }}>{shortName(b)}</span></div>
      <div className="num text-fg-3">{(p.in_service_gap_days ?? 0).toLocaleString()} days apart · score {p.score.toFixed(0)}</div>
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
