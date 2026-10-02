const US_QUERY_ALIASES = new Set([
  "united states",
  "united states of america",
  "usa",
  "u s a",
  "us",
  "u s",
  "america",
]);

const US_STATE_ABBREVIATIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC",
];

const US_LOCATION_PHRASES = [
  "remote in usa",
  "remote in the usa",
  "remote in us",
  "remote us",
  "remote usa",
  "remote united states",
  "united states",
  "usa",
  "u.s.",
  "u.s.a.",
  "new york city",
  "san francisco bay area",
  "san francisco",
  "los angeles",
  "seattle",
  "austin",
  "boston",
  "chicago",
  "atlanta",
  "washington, dc",
];

function compact(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function isUnitedStatesQuery(query: string): boolean {
  return US_QUERY_ALIASES.has(compact(query));
}

function isUnitedStatesLocation(location: string): boolean {
  const raw = location.trim();
  const normalized = compact(raw);
  if (!normalized) return false;
  const padded = ` ${normalized} `;
  if (US_LOCATION_PHRASES.some((phrase) => padded.includes(` ${compact(phrase)} `))) return true;
  return US_STATE_ABBREVIATIONS.some((state) => new RegExp(`(?:^|[\\s,])${state}(?:$|[\\s,])`, "i").test(raw));
}

export function matchesLocationFilter(query: string, locations: string[], remote?: boolean): boolean {
  const q = query.trim();
  if (!q) return true;

  const haystack = locations.join(" ").toLowerCase();
  const normalizedQuery = q.toLowerCase();
  if (normalizedQuery === "remote") return !!remote || haystack.includes("remote");
  if (isUnitedStatesQuery(q)) return locations.some(isUnitedStatesLocation);
  return haystack.includes(normalizedQuery);
}

export function splitLocationFilters(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function matchesLocationPreferences(preferences: string[], locations: string[], remote?: boolean): boolean {
  if (preferences.length === 0) return true;
  return preferences.some((pref) => matchesLocationFilter(pref, locations, remote));
}
