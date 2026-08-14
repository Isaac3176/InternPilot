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
function initialsFor(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
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

  useEffect(() => { setUrls(initialUrls(company)); setIdx(0); }, [company]);

  const showImg = idx < urls.length;
  const cls = "logo" + (showImg ? " img" : "") + (className ? ` ${className}` : "");

  if (showImg) {
    const src = urls[idx];
    return (
      <div className={cls}>
        <img
          src={src} alt="" loading="lazy"
          onLoad={() => { if (logoCacheGet(company) !== src) logoCacheSet(company, src); }}
          onError={() => {
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
  return <div className={cls} style={{ background: monogramBg(company) }}>{initialsFor(company)}</div>;
}
