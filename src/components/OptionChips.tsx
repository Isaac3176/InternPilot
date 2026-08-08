export interface ChipOption { value: string; label: string; badge?: string }

/**
 * Simplify-style selectable option cards (single or multi). Each option is a
 * card with a check indicator — nicer than a bare dropdown/checkbox row.
 */
export default function OptionChips({
  options, value, onChange, multi = false,
}: {
  options: ChipOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multi?: boolean;
}) {
  const isSel = (v: string) => (Array.isArray(value) ? value.includes(v) : value === v);
  function pick(v: string) {
    if (multi) {
      const arr = Array.isArray(value) ? value : [];
      onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    } else {
      onChange(isSel(v) ? "" : v);
    }
  }
  return (
    <div className="opt-chips">
      {options.map((o) => (
        <button type="button" key={o.value} className={`opt-chip${isSel(o.value) ? " on" : ""}`} onClick={() => pick(o.value)}>
          <span className="opt-box">{isSel(o.value) && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          )}</span>
          <span className="opt-label">{o.label}</span>
          {o.badge && <span className="opt-badge">{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}
