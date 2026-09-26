import { HardHat, LandPlot, Merge, Warehouse, type LucideProps } from "lucide-react";
import { TIER, UTILITY_NAME } from "../data/format";
import type { Pair, Project, TierId, Utility } from "../data/types";

import { utilitySymbol } from "../data/mapPresentation";

const ICONS = { 1: Merge, 2: LandPlot, 3: Warehouse, 4: HardHat } as const;

export function TierIcon({ tier, ...rest }: { tier: TierId } & LucideProps) {
  const I = ICONS[tier];
  return <I {...rest} />;
}

export function TierChip({ tier, compact = false }: { tier: TierId; compact?: boolean }) {
  const t = TIER[tier];
  return (
    <span className="chip" style={{ color: t.color, background: `color-mix(in oklab, ${t.color} 14%, transparent)` }}>
      <TierIcon tier={tier} size={12} strokeWidth={2.4} />
      {compact ? t.short : t.label}
    </span>
  );
}

export function UtilitySymbol({ utility, size = 16 }: { utility: Utility; size?: number }) {
  const symbol = utilitySymbol(utility);
  return <svg className="utility-symbol" width={size} height={size} viewBox="0 0 16 16" role="img" aria-label={`${UTILITY_NAME[utility]} (${symbol.shape.toLowerCase()})`}>
    <path d={symbol.path} fill={symbol.color} stroke="var(--color-ink-1)" strokeWidth="1" />
  </svg>;
}

export function UtilityDot({ p, size = 12 }: { p: Project; size?: number }) {
  return <UtilitySymbol utility={p.utility} size={size} />;
}


export function TimelineGlyph({ timeline }: { timeline: Pair["timeline"] }) {
  const map = {
    concurrent: { c: "var(--color-t3)", t: "Same time" },
    "back-to-back": { c: "var(--color-fg-2)", t: "Back-to-back" },
    separate: { c: "var(--color-fg-3)", t: "Years apart" },
  } as const;
  const m = map[timeline];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: m.c }}>
      <svg width="18" height="8" viewBox="0 0 18 8" aria-hidden>
        {timeline === "concurrent" ? (
          <>
            <rect x="0" y="0" width="13" height="3" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="5" y="5" width="13" height="3" rx="1.5" fill="currentColor" />
          </>
        ) : timeline === "back-to-back" ? (
          <>
            <rect x="0" y="0" width="8" height="3" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="10" y="5" width="8" height="3" rx="1.5" fill="currentColor" />
          </>
        ) : (
          <>
            <rect x="0" y="0" width="5" height="3" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="13" y="5" width="5" height="3" rx="1.5" fill="currentColor" />
          </>
        )}
      </svg>
      {m.t}
    </span>
  );
}
