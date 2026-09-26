import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Right-side slide-over for secondary detail (spec 4.2: side panels, not pages). */
export default function Drawer({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
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
    </div>
  );
}
