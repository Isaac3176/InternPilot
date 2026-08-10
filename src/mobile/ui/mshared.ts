/** Small formatting/helpers shared across the mobile-web screens. */

export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).slice(0, 2);
  const out = parts.map((w) => w[0]?.toUpperCase() ?? "").join("");
  return out || "?";
}

/** Whole days since an ISO date string, or null if unparseable. */
export function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Compact "2h ago" / "3d ago" for a unix-seconds posting time. */
export function postedShort(datePosted?: number): string {
  if (!datePosted) return "";
  const h = (Date.now() - datePosted * 1000) / 3_600_000;
  if (h < 1) return "just now";
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function bandColor(v: number): string {
  return v >= 80 ? "var(--good)" : v >= 65 ? "var(--accent)" : "var(--warn)";
}
