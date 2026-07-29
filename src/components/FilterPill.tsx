import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  label: string;
  /** Shown as "(n)" and highlights the pill when > 0. */
  count?: number;
  width?: number;
  children: ReactNode;
}

/** Simplify-style filter pill that opens a dropdown popover, closing on outside click. */
export default function FilterPill({ label, count = 0, width = 320, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div className="filter-pill-wrap" ref={ref}>
      <button type="button" className={"filter-pill" + (count > 0 ? " active" : "")} onClick={() => setOpen((o) => !o)}>
        {label}{count > 0 ? ` (${count})` : ""}
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="filter-popover" style={{ width }}>
          {children}
        </div>
      )}
    </div>
  );
}
