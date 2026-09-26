# GridLock color system

The map and interface share a dusk landscape palette: green land, blue water,
warm roads, and deep teal surfaces. Geography provides context; utility projects
and the active measurement have the strongest contrast.

## Source of truth

`palette.ts` owns color values. `installPalette()` exposes them as CSS variables
before React mounts; `index.css` registers their Tailwind roles. MapLibre and
data graphics import the same palette directly. Change values in one place.

| Role | Use |
| --- | --- |
| `ink-0` through `ink-3` | Canvas, panels, raised controls, hover |
| `fg`, `fg-2`, `fg-3` | Primary, supporting, and secondary text |
| `action`, `on-action`, `focus` | Warm primary actions and visible keyboard focus |
| `selection`, `selection-fg` | Teal selected rows, tabs, and controls |
| `desc`, `gpc`, `coplan` | Mint circles, lavender squares, neutral diamonds |
| `success`, `warning`, `error`, `info` | Supporting states, always accompanied by text |
| `map-*` | Geographic context, labels, and neutral measurements |

The tier aliases remain available for existing analytical charts. The map key
and distance measurements do not use the tier palette. Print briefs retain
their separate white-paper treatment.

## Map styling

`mapStyle.ts` defines a small vector basemap using OpenFreeMap's OpenMapTiles
schema. Land cover, water, roads, and labels can be styled independently. POIs
and road shields are intentionally omitted. Satellite mode uses Esri imagery
with the same project geometry and readable place labels. Provider attribution
is supplied by each source and repeated in the methodology view.

## Contrast

Check text against both its resting surface and selected/hovered surfaces.
Body text targets 4.5:1; control outlines, utility symbols, and focus indicators
target 3:1. Color supplements utility shapes, route patterns, labels, and
selection weight. Do not introduce distance colors into the map key.
