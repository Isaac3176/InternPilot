import { useEffect, useRef, useState, type KeyboardEvent } from "react";

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  allowCustom?: boolean;
  id?: string;
}

const MAX_OPTIONS = 8;

/**
 * Simplify-style multi-select: chips for selected values, a searchable input,
 * and a dropdown of curated suggestions. Enter adds a custom value, Backspace on
 * an empty query removes the last chip, clicking outside closes the dropdown.
 */
export default function TagMultiSelect({
  values,
  onChange,
  suggestions,
  placeholder = "Search…",
  allowCustom = true,
  id,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const selected = new Set(values.map((v) => v.toLowerCase()));
  const q = query.trim().toLowerCase();
  const options = suggestions
    .filter((s) => !selected.has(s.toLowerCase()) && (!q || s.toLowerCase().includes(q)))
    .slice(0, MAX_OPTIONS);

  function add(value: string) {
    const v = value.trim();
    if (!v || selected.has(v.toLowerCase())) {
      setQuery("");
      return;
    }
    onChange([...values, v]);
    setQuery("");
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (options.length > 0) add(options[0]);
      else if (allowCustom) add(query);
    } else if (e.key === "Backspace" && query === "" && values.length > 0) {
      remove(values[values.length - 1]);
    }
  }

  return (
    <div className="tag-select" ref={containerRef}>
      <div className="tag-select-control" onClick={() => setOpen(true)}>
        {values.map((v) => (
          <span className="tag-chip" key={v}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(v)}>×</button>
          </span>
        ))}
        <input
          id={id}
          className="tag-select-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={values.length === 0 ? placeholder : ""}
        />
      </div>

      {open && (options.length > 0 || (allowCustom && q)) && (
        <div className="tag-dropdown">
          {options.map((o) => (
            <button type="button" className="tag-option" key={o} onClick={() => add(o)}>
              {o}
            </button>
          ))}
          {allowCustom && q && !suggestions.some((s) => s.toLowerCase() === q) && (
            <button type="button" className="tag-option tag-option-custom" onClick={() => add(query)}>
              Add “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
