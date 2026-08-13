import { useEffect, useMemo, useState } from "react";
import { isLogosOn, logoSources } from "../listings/logo";

const LOGO_COLORS = [
  "#1F6FEB", "#7C5CFF", "#157F5F", "#B03D2A", "#A9761C",
  "#12509E", "#3E4C8C", "#4B4FD6", "#33383D", "#D6455E",
];
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}
function shade(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (x: number) => Math.max(0, Math.min(255, x));
  return `rgb(${clamp(((n >> 16) & 255) + delta)},${clamp(((n >> 8) & 255) + delta)},${clamp((n & 255) + delta)})`;
}
/** A soft top-lit gradient so the monogram fallback reads as a designed tile, not a flat block. */
function monogramBg(name: string): string {
  const c = colorFor(name);
  return `linear-gradient(140deg, ${shade(c, 22)}, ${c} 55%, ${shade(c, -26)})`;
}
function initialsFor(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/**
 * Company avatar: a DuckDuckGo icon when logos are enabled and a domain can be
 * guessed, otherwise (or on load failure) a gradient monogram. Reuses the
 * existing `.logo` styles so sizing matches wherever it's dropped in.
 */
export default function CompanyLogo({ company, className }: { company: string; className?: string }) {
  const urls = useMemo(() => logoSources(company), [company]);
  const [idx, setIdx] = useState(0);

  // Restart from the first source when the company changes.
  useEffect(() => setIdx(0), [company]);

  const showImg = isLogosOn() && idx < urls.length;
  const cls = "logo" + (showImg ? " img" : "") + (className ? ` ${className}` : "");

  if (showImg) {
    return (
      <div className={cls}>
        <img src={urls[idx]} alt="" loading="lazy" onError={() => setIdx((i) => i + 1)} />
      </div>
    );
  }
  return <div className={cls} style={{ background: monogramBg(company) }}>{initialsFor(company)}</div>;
}
