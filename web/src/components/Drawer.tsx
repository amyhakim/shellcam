import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import Tour from "./Tour";

/** Right-side slide-over for secondary detail (spec 4.2: side panels, not pages). */
export default function Drawer({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const { state } = useStore();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const workspace = document.querySelector<HTMLElement>(".map-workspace");
    const wasInert = workspace?.inert ?? false;
    if (workspace) workspace.inert = true;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); }
      if (e.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter((el) => el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      if (workspace) workspace.inert = wasInert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="anim-fade absolute inset-0 bg-ink-0/60" onClick={onClose} />
      <aside className="panel anim-slide absolute bottom-3 right-3 top-3 flex w-[min(560px,calc(100%-24px))] flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
            {sub && <p className="mt-0.5 text-[12.5px] text-fg-3">{sub}</p>}
          </div>
          <button ref={closeRef} className="btn h-8 px-2" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
      {state.tourStep != null && <Tour />}
    </div>
  );
}
