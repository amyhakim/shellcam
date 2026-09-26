/** Tiny bridge so panels (tour, palette, buttons) can drive the map camera. */
export type CameraTarget =
  | { kind: "region"; name: "southeast" | "Savannah" | "Augusta" | "globe" }
  | { kind: "pair"; id: string }
  | { kind: "project"; id: string }
  | { kind: "zoom"; dir: 1 | -1 };

type Fn = (t: CameraTarget) => void;
let impl: Fn | null = null;
let pending: CameraTarget | null = null;

export function registerCamera(fn: Fn | null) {
  impl = fn;
  if (fn && pending) {
    fn(pending);
    pending = null;
  }
}

export function flyTo(t: CameraTarget) {
  if (impl) impl(t);
  else pending = t;
}

export const REGION_VIEWS = {
  globe: { center: [-72, 27] as [number, number], zoom: 1.45, pitch: 0, bearing: 0 },
  southeast: { center: [-81.35, 32.95] as [number, number], zoom: 6.6, pitch: 38, bearing: -12 },
  Savannah: { center: [-81.1, 32.3] as [number, number], zoom: 9.3, pitch: 52, bearing: -24 },
  Augusta: { center: [-82.05, 33.5] as [number, number], zoom: 9.1, pitch: 52, bearing: 18 },
};
