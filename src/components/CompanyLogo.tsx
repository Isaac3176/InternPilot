import { useEffect, useState } from "react";
import { isLogosOn, logoSources, logoCacheGet, logoCacheSet, logoCacheClear } from "../listings/logo";

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
export function companyInitials(name: string): string {
  const words = name.match(/[a-z0-9]+/gi) ?? [];
  if (words.length === 0) return "?";
  if (words.every((w) => /^\d+$/.test(w))) return words[0]?.slice(0, 2) ?? "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/**
 * Company avatar: a real logo when one resolves (cached after first success),
 * otherwise a gradient monogram. Reuses the existing `.logo` styles.
 */
function initialUrls(company: string): string[] {
  if (!isLogosOn()) return [];
  const cached = logoCacheGet(company);
  if (typeof cached === "string") return [cached]; // known-good → straight to it
  if (cached === null) return [];                  // known-none → monogram, no requests
  return logoSources(company);                     // unknown → walk the chain
}

export default function CompanyLogo({ company, className }: { company: string; className?: string }) {
  const [urls, setUrls] = useState<string[]>(() => initialUrls(company));
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setUrls(initialUrls(company)); setIdx(0); setLoaded(false); }, [company]);

  const showImg = idx < urls.length;
  const cls = "logo" + (showImg ? ` img ${loaded ? "is-loaded" : "is-loading"}` : "") + (className ? ` ${className}` : "");
  const initials = companyInitials(company);
  const label = `${company} logo`;

  if (showImg) {
    const src = urls[idx];
    return (
      <div className={cls} title={label} role="img" aria-label={label} style={loaded ? undefined : { background: monogramBg(company) }}>
        <span className="logo-fallback">{initials}</span>
        <img
          src={src} alt="" loading="lazy"
          onLoad={() => { setLoaded(true); if (logoCacheGet(company) !== src) logoCacheSet(company, src); }}
          onError={() => {
            setLoaded(false);
            if (idx + 1 < urls.length) { setIdx(idx + 1); return; }
            // Exhausted: a stale single cached URL → clear so it re-resolves next
            // mount; a full-chain miss → remember there's no logo.
            if (urls.length === 1 && logoCacheGet(company) === src) logoCacheClear(company);
            else logoCacheSet(company, null);
            setIdx(urls.length); // → monogram
          }}
        />
      </div>
    );
  }
  return <div className={cls} title={label} role="img" aria-label={label} style={{ background: monogramBg(company) }}>{initials}</div>;
}
