/**
 * Company logo helpers for the Discover feed. We resolve a best-guess domain
 * from the company name and load the icon from DuckDuckGo (falling back to
 * Google's favicon service); the UI always falls back to a colored monogram
 * when there's no domain or both sources 404. (Clearbit's logo API was shut
 * down after the HubSpot acquisition, so it's no longer usable.)
 */

// Names that don't slugify cleanly to "{name}.com".
const OVERRIDES: Record<string, string> = {
  "two sigma": "twosigma.com",
  "jane street": "janestreet.com",
  "d. e. shaw": "deshaw.com",
  "de shaw": "deshaw.com",
  "hudson river trading": "hudsonrivertrading.com",
  "jump trading": "jumptrading.com",
  "citadel securities": "citadelsecurities.com",
  "goldman sachs": "goldmansachs.com",
  "morgan stanley": "morganstanley.com",
  "jpmorgan chase": "jpmorganchase.com",
  "jp morgan": "jpmorganchase.com",
  "bank of america": "bankofamerica.com",
  "capital one": "capitalone.com",
  "general motors": "gm.com",
  "lockheed martin": "lockheedmartin.com",
  "l3harris": "l3harris.com",
  "northrop grumman": "northropgrumman.com",
  "texas instruments": "ti.com",
  "procter & gamble": "pg.com",
  "johnson & johnson": "jnj.com",
  "state farm": "statefarm.com",
  "meta": "meta.com",
  "alphabet": "abc.xyz",
  "x (twitter)": "x.com",
};

// Company-name suffixes to strip before slugifying.
const SUFFIXES = /\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology|labs|group|holdings|systems|solutions)\b/g;

// If the name already looks like a domain (e.g. "SiMa.ai"), use it as-is.
const DOMAINISH = /^[a-z0-9-]+\.(ai|io|com|co|dev|xyz|so|app|tech|net|org)$/;

/** Best-guess registrable domain for a company name, or null if we can't. */
export function companyDomain(company: string): string | null {
  const key = company.trim().toLowerCase();
  if (!key) return null;
  if (OVERRIDES[key]) return OVERRIDES[key];
  if (DOMAINISH.test(key)) return key;

  const slug = key
    .replace(/&/g, "and")
    .replace(SUFFIXES, "")
    .replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : null;
}

/**
 * Icon URLs to try in order for a domain. DuckDuckGo returns a real,
 * reasonably-sized icon and a proper 404 for unknown domains (so wrong guesses
 * fall through to the monogram); Google's favicon service is the backup.
 */
export function logoUrls(domain: string): string[] {
  return [
    `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
  ];
}

const K_LOGOS_ON = "internpilot.listings.logosOn";

/** Whether to load remote company logos (default on). */
export function isLogosOn(): boolean {
  return localStorage.getItem(K_LOGOS_ON) !== "0";
}
export function setLogosOn(on: boolean): void {
  localStorage.setItem(K_LOGOS_ON, on ? "1" : "0");
}
