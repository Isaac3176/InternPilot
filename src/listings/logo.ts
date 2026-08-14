/**
 * Company logos for the feed. Two problems make this hard: guessing the right
 * domain from a messy company name, and finding a real logo for it. We (1) resolve
 * a best-guess domain (overrides + suffix-stripping + a first-word fallback), then
 * (2) try several logo sources in order — an optional Logo.dev token (best,
 * Simplify-grade), the unavatar aggregator, then DuckDuckGo — before the UI falls
 * back to a colored monogram. Set a Logo.dev token in Settings for full coverage.
 */

// Names that don't slugify cleanly to "{name}.com".
const OVERRIDES: Record<string, string> = {
  "two sigma": "twosigma.com", "jane street": "janestreet.com",
  "d. e. shaw": "deshaw.com", "de shaw": "deshaw.com",
  "hudson river trading": "hudsonrivertrading.com", "jump trading": "jumptrading.com",
  "citadel securities": "citadelsecurities.com", "goldman sachs": "goldmansachs.com",
  "morgan stanley": "morganstanley.com", "jpmorgan chase": "jpmorganchase.com", "jp morgan": "jpmorganchase.com",
  "bank of america": "bankofamerica.com", "capital one": "capitalone.com",
  "general motors": "gm.com", "lockheed martin": "lockheedmartin.com", "l3harris": "l3harris.com",
  "northrop grumman": "northropgrumman.com", "texas instruments": "ti.com",
  "procter & gamble": "pg.com", "johnson & johnson": "jnj.com", "state farm": "statefarm.com",
  "meta": "meta.com", "alphabet": "abc.xyz", "x (twitter)": "x.com",
  "tmeic": "tmeic.com", "tmeic corporation americas": "tmeic.com",
  "assured guaranty": "assuredguaranty.com", "dv trading": "dvtrading.co",
  "rtx": "rtx.com", "raytheon": "rtx.com", "walmart global tech": "walmart.com",
  "palo alto networks": "paloaltonetworks.com", "amazon web services": "aws.amazon.com",
  "aws": "aws.amazon.com", "cotiviti": "cotiviti.com", "oracle": "oracle.com",
};

// Corporate suffixes/qualifiers to strip before slugifying (so "TMEIC Corporation
// Americas" → "tmeic"). Global for replace; a separate word-form for filtering.
const SUFFIXES = /\b(incorporated|inc|llc|l\.l\.c|ltd|limited|plc|corp(oration)?|company|technolog(ies|y)|labs?|group|holdings?|systems?|solutions?|americas?|international|global|worldwide|usa|na|company|co|gmbh|ag|sa|the)\b/g;
const SUFFIX_WORD = /^(incorporated|inc|llc|ltd|limited|plc|corp|corporation|company|technologies|technology|labs?|group|holdings?|systems?|solutions?|americas?|international|global|worldwide|usa|na|co|gmbh|ag|sa|the)$/i;
const DOMAINISH = /^[a-z0-9-]+\.(ai|io|com|co|dev|xyz|so|app|tech|net|org)$/;

function slug(name: string): string {
  return name.replace(/&/g, "and").replace(SUFFIXES, "").replace(/[^a-z0-9]/g, "");
}

/** Best-guess registrable domains for a company name, best first (may be empty). */
export function companyDomains(company: string): string[] {
  const key = company.trim().toLowerCase();
  if (!key) return [];
  if (OVERRIDES[key]) return [OVERRIDES[key]];
  if (DOMAINISH.test(key)) return [key];

  const out: string[] = [];
  const full = slug(key);
  if (full.length >= 2) out.push(`${full}.com`);
  // First significant word — handles multi-word names whose domain is just the core.
  const words = key.replace(/&/g, "and").split(/[^a-z0-9]+/).filter((w) => w && !SUFFIX_WORD.test(w));
  if (words[0] && words[0].length >= 3) {
    const fw = `${words[0]}.com`;
    if (!out.includes(fw)) out.push(fw);
  }
  return out;
}

/** Back-compat single best domain. */
export function companyDomain(company: string): string | null {
  return companyDomains(company)[0] ?? null;
}

const LOGO_TOKEN_KEY = "internpilot.logo.token";
/** Optional Logo.dev publishable token (client-safe) for professional-grade logos. */
export function getLogoToken(): string {
  try { return localStorage.getItem(LOGO_TOKEN_KEY) ?? ""; } catch { return ""; }
}
export function setLogoToken(value: string): void {
  try {
    if (value.trim()) localStorage.setItem(LOGO_TOKEN_KEY, value.trim());
    else localStorage.removeItem(LOGO_TOKEN_KEY);
  } catch { /* ignore */ }
}

/**
 * Ordered logo image URLs to try for a company, best first. The <img> walks this
 * list on error; when it's exhausted the UI shows a monogram. unavatar aggregates
 * many sources and `fallback=false` makes it 404 cleanly on a real miss.
 */
export function logoSources(company: string): string[] {
  const domains = companyDomains(company);
  if (!domains.length) return [];
  const token = getLogoToken();
  const urls: string[] = [];
  for (const d of domains) {
    if (token) urls.push(`https://img.logo.dev/${d}?token=${encodeURIComponent(token)}&size=128&format=png&retina=true`);
    urls.push(`https://unavatar.io/${encodeURIComponent(d)}?fallback=false`);
    urls.push(`https://icons.duckduckgo.com/ip3/${d}.ico`);
  }
  return urls;
}

/**
 * Resolved-logo cache: once a company's logo resolves (or is confirmed to have
 * none), remember it so scrolling/refreshing doesn't re-walk the source chain —
 * faster feed and far fewer live requests (which also eases rate-limiting). The
 * cache is keyed by whether a Logo.dev token is set, so adding/removing one
 * re-resolves everything.
 */
const CACHE_KEY = "internpilot.logo.cache";
const CACHE_SIG_KEY = "internpilot.logo.cache.sig";
const cacheSig = () => (getLogoToken() ? "t" : "n");
function readCache(): Record<string, string | null> {
  try {
    if (localStorage.getItem(CACHE_SIG_KEY) !== cacheSig()) return {};
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, string | null>;
  } catch { return {}; }
}
function writeCache(map: Record<string, string | null>): void {
  try { localStorage.setItem(CACHE_SIG_KEY, cacheSig()); localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}
/** Cached resolution: a URL (works), null (no logo → monogram), or undefined (unknown). */
export function logoCacheGet(company: string): string | null | undefined {
  const m = readCache(); const k = company.trim().toLowerCase();
  return k in m ? m[k] : undefined;
}
export function logoCacheSet(company: string, url: string | null): void {
  const m = readCache(); m[company.trim().toLowerCase()] = url; writeCache(m);
}
export function logoCacheClear(company: string): void {
  const m = readCache(); delete m[company.trim().toLowerCase()]; writeCache(m);
}

const K_LOGOS_ON = "internpilot.listings.logosOn";
/** Whether to load remote company logos (default on). */
export function isLogosOn(): boolean {
  return localStorage.getItem(K_LOGOS_ON) !== "0";
}
export function setLogosOn(on: boolean): void {
  localStorage.setItem(K_LOGOS_ON, on ? "1" : "0");
}
