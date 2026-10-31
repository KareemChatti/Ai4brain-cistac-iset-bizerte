import { useEffect } from "react";
import type { ReactNode } from "react";

export function CoachDrawer({
  children,
  open,
  folded,
  onClose,
  onFold,
}: {
  children: ReactNode;
  open: boolean;
  folded: boolean;
  onClose: () => void;
  onFold: (folded: boolean) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <button type="button" className="coach-scrim lg:hidden" aria-label="Close the coach" onClick={onClose} />}
      {folded ? (
        <div className="hidden lg:block">
          <button type="button" className="btn btn-sm" aria-expanded={false} aria-controls="coach-drawer" onClick={() => onFold(false)}>
            Show coach
          </button>
        </div>
      ) : null}
      <aside
        id="coach-drawer"
        className={`coach-drawer lg:w-[var(--drawer-w)] ${folded ? "lg:hidden" : ""}`}
        data-open={open}
        aria-label="Coach panel"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg">Coach</h2>
          <button type="button" className="btn btn-quiet btn-sm lg:hidden" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn-quiet btn-sm hidden lg:inline-flex" onClick={() => onFold(true)}>
            Hide
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
