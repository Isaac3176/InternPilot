import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface Command { label: string; to: string; group: string }

/**
 * ⌘K command palette — reaches every destination from anywhere, which is what
 * lets the desktop rail stay at five items instead of nineteen.
 */
export default function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(term) || c.group.toLowerCase().includes(term));
  }, [q, commands]);

  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;

  function choose(i: number) {
    const cmd = results[i];
    if (cmd) { navigate(cmd.to); onClose(); }
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  return (
    <div className="cmdp-scrim" onClick={onClose}>
      <div className="cmdp" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmdp-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input ref={inputRef} className="cmdp-input" placeholder="Search destinations, roles, settings…" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdp-list">
          {results.length === 0 ? (
            <div className="cmdp-empty">No matches for “{q}”.</div>
          ) : results.map((c, i) => (
            <button key={c.to} type="button" className={"cmdp-item" + (i === sel ? " sel" : "")}
              onMouseEnter={() => setSel(i)} onClick={() => choose(i)}>
              <span className="cmdp-label">{c.label}</span>
              <span className="cmdp-group">{c.group}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
