/**
 * Ranking preferences: the deterministic profile that drives hard filters,
 * scoring, and notification thresholds. Defaults come from the spec's
 * recommended configuration; the user edits them in Settings.
 */

export interface RankingPrefs {
  graduationYear: number;
  employmentTypes: string[]; // e.g. ["internship"]
  targetSeason: string;
  targetRoles: string[];
  blockedRoles: string[];
  /** Postings older than this many days are muted. */
  freshnessDays: number;
  // Notification thresholds (0-100 priority score).
  instantMin: number;
  standardMin: number;
  digestMin: number;
  maxInstantPerDay: number;
  quietStart: number; // hour 0-23 (inclusive)
  quietEnd: number; // hour 0-23 (exclusive)
}

export const DEFAULT_PREFS: RankingPrefs = {
  graduationYear: 2028,
  employmentTypes: ["internship"],
  targetSeason: "Summer 2027",
  targetRoles: [
    "Software Engineer Intern",
    "Backend Engineer Intern",
    "Security Engineer Intern",
    "Machine Learning Engineer Intern",
    "Platform Engineer Intern",
    "Cloud Engineer Intern",
    "Data Engineer Intern",
  ],
  blockedRoles: [
    "IT Support",
    "Help Desk",
    "Business Analyst",
    "Hardware Technician",
    "Senior Software Engineer",
    "Product Manager",
  ],
  freshnessDays: 14,
  instantMin: 85,
  standardMin: 70,
  digestMin: 55,
  maxInstantPerDay: 8,
  quietStart: 22,
  quietEnd: 8,
};

const KEY = "internpilot.ranking.prefs";

export function getPrefs(): RankingPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<RankingPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Partial<RankingPrefs>): void {
  localStorage.setItem(KEY, JSON.stringify({ ...getPrefs(), ...prefs }));
}

/** Whether the current local time falls within the user's quiet hours. */
export function inQuietHours(prefs: RankingPrefs, hour: number): boolean {
  const { quietStart, quietEnd } = prefs;
  if (quietStart === quietEnd) return false;
  // Handles overnight ranges (e.g. 22 → 8).
  return quietStart < quietEnd
    ? hour >= quietStart && hour < quietEnd
    : hour >= quietStart || hour < quietEnd;
}
