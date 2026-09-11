/**
 * Ranking preferences: the deterministic profile that drives hard filters,
 * scoring, and notification thresholds. Defaults come from the spec's
 * recommended configuration; the user edits them in Settings.
 */
import { mirrorLocalSetting } from "../cloud/userSettings";

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

interface ProfilePrefsInput {
  grad_year?: string | number | null;
  graduation_date?: string | null;
  target_date?: string | null;
  target_roles?: string | null;
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
  mirrorLocalSetting(KEY);
}

function splitCsv(value: string | null | undefined): string[] {
  return (value ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

function seasonForDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getMonth();
  const season = month <= 1 ? "Winter" : month <= 4 ? "Spring" : month <= 7 ? "Summer" : "Fall";
  return `${season} ${date.getFullYear()}`;
}

function graduationYear(input: ProfilePrefsInput): number | null {
  const direct = Number(input.grad_year);
  if (Number.isFinite(direct) && direct >= 2000) return direct;
  const fromDate = String(input.graduation_date ?? "").match(/20\d\d/)?.[0];
  return fromDate ? Number(fromDate) : null;
}

function targetSeason(input: ProfilePrefsInput, employmentTypes: string[]): string | null {
  const gradYear = graduationYear(input);
  if (gradYear && employmentTypes.some((t) => t === "internship" || t === "coop")) return `Summer ${gradYear - 1}`;
  if (gradYear && employmentTypes.includes("new_grad")) return `Summer ${gradYear}`;
  return seasonForDate(input.target_date);
}

function rolesForEmployment(roles: string[], employmentTypes: string[]): string[] {
  const wantsInternship = employmentTypes.some((t) => t === "internship" || t === "coop");
  const wantsNewGrad = employmentTypes.includes("new_grad");
  return roles.map((role) => {
    if (wantsInternship && !/intern|co-?op/i.test(role)) return `${role} Intern`;
    if (wantsNewGrad && !/new ?grad|graduate|intern|co-?op/i.test(role)) return `${role} New Grad`;
    return role;
  });
}

export function syncPrefsFromProfile(input: ProfilePrefsInput, employmentTypes?: string[]): RankingPrefs {
  const current = getPrefs();
  const nextEmploymentTypes = employmentTypes?.length ? employmentTypes : current.employmentTypes;
  const roles = splitCsv(input.target_roles);
  const year = graduationYear(input);
  const season = targetSeason(input, nextEmploymentTypes);
  const patch: Partial<RankingPrefs> = {
    employmentTypes: nextEmploymentTypes,
  };
  if (year) patch.graduationYear = year;
  if (season) patch.targetSeason = season;
  if (roles.length) patch.targetRoles = rolesForEmployment(roles, nextEmploymentTypes);
  savePrefs(patch);
  return getPrefs();
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
