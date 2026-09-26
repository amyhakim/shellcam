/** Dusk landscape palette. CSS, utility graphics, and MapLibre share these roles. */
const semantic = {
  error: "#ee9897",
  warning: "#e8bd74",
  info: "#8bc5dc",
  success: "#91ceb3",
};

export const PALETTE = {
  "ink-0": "#09171d",
  "ink-1": "#10252c",
  "ink-2": "#19333a",
  "ink-3": "#23434a",
  line: "#2f4b52",
  "line-strong": "#55777d",
  fg: "#edf4ef",
  "fg-2": "#b5cbca",
  "fg-3": "#a1babb",
  action: "#e8bd74",
  "action-hover": "#f2cd91",
  "on-action": "#17272b",
  focus: "#f2cd91",
  selection: "#254b52",
  "selection-fg": "#d7efec",
  "selection-border": "#84b7bd",
  desc: "#2ee6a6",
  gpc: "#a594ff",
  coplan: "#a6b9b9",
  ...semantic,
  // Existing tier aliases retain their meaning while using the quieter semantic family.
  t1: semantic.error,
  t2: semantic.warning,
  t3: "#d8cb91",
  t4: semantic.info,
  money: semantic.success,
  "map-land": "#293f3c",
  "map-forest": "#294e3d",
  "map-grass": "#3c513e",
  "map-park": "#315c46",
  "map-urban": "#414b48",
  "map-water": "#173f59",
  "map-water-edge": "#32617a",
  "map-river": "#467e96",
  "map-road": "#b39870",
  "map-road-minor": "#6c807a",
  "map-boundary": "#92aaa2",
  "map-label": "#d0dfd9",
  "map-water-label": "#9bc7dc",
  "map-halo": "#11262d",
  "map-grid": "#809c99",
  "map-measure": "#f4f3e7",
  "map-horizon": "#315565",
} as const;

export function installPalette() {
  for (const [role, value] of Object.entries(PALETTE)) {
    document.documentElement.style.setProperty(`--palette-${role}`, value);
  }
}
