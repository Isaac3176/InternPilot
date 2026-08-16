/**
 * Application-question audit. Most screening answers come straight from your
 * profile's autofill (sponsorship, work auth, grad date, GPA, location), so we
 * can reconstruct "what you answered" without re-entering it per application, and
 * flag the ones that commonly trigger automated eligibility screens.
 *
 * When a rejection lands suspiciously fast, we surface those risk answers as a
 * "possible automatic screen" — explicitly LOW CONFIDENCE. The point is to move a
 * rejection out of "my résumé is bad" and toward a checkable, mechanical cause.
 */
import type { ApplicationRow, Profile } from "../db/types";

export interface AuditItem {
  category: string;
  label: string;
  value: string;
  risk: boolean;   // could plausibly trip an automated screen
  note: string;
}
export interface FastRejection {
  app: ApplicationRow;
  hoursToResult: number;
  likelihood: "very likely" | "possibly";
  items: AuditItem[]; // risk items first
}

const DEFENSE = /raytheon|\brtx\b|lockheed|northrop|boeing|general dynamics|\bl3\b|\bbae\b|anduril|palantir|leidos|saic/i;

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const isYes = (s: string | null | undefined) => { const v = norm(s); return !!v && (v.startsWith("y") || v.includes("require") || v.includes("need")) && !v.startsWith("n"); };
const isNo = (s: string | null | undefined) => { const v = norm(s); return v.startsWith("n") || v.includes("not "); };

/** The screening answers your autofill would give, with the risky ones flagged. */
export function screeningItems(profile: Profile | null, app?: ApplicationRow): AuditItem[] {
  const items: AuditItem[] = [];
  if (!profile) return items;

  // Sponsorship — the single biggest automated-screen trigger.
  if (profile.requires_sponsorship) {
    const risk = isYes(profile.requires_sponsorship);
    items.push({ category: "sponsorship", label: "Requires sponsorship", value: profile.requires_sponsorship, risk,
      note: risk ? "Many US intern reqs auto-filter anyone needing sponsorship." : "Not a common auto-filter." });
  }
  // Work authorization.
  if (profile.authorized_us) {
    const risk = isNo(profile.authorized_us);
    items.push({ category: "work_auth", label: "Authorized to work in the US", value: profile.authorized_us, risk,
      note: risk ? "\"Not authorized\" is an instant disqualifier on most US roles." : "" });
  }
  // GPA cutoff.
  if (profile.gpa) {
    const g = parseFloat(profile.gpa);
    const risk = !Number.isNaN(g) && g > 0 && g < 3.0;
    items.push({ category: "gpa", label: "GPA", value: profile.gpa, risk,
      note: risk ? "Some employers set an automated GPA floor (often 3.0)." : "" });
  }
  // Graduation timing — shown for review; hard to auto-judge, so not risk-flagged.
  if (profile.graduation_date || profile.grad_year) {
    items.push({ category: "graduation", label: "Graduation date", value: profile.graduation_date ?? profile.grad_year ?? "", risk: false,
      note: "Check it fits the role's class year — internships often require a specific graduation window." });
  }
  // Location / relocation mismatch (needs the posting's location).
  if (app?.location) {
    const loc = norm(app.location);
    const remoteRole = /remote/.test(loc);
    const prefLocs = norm(profile.locations);
    const here = norm(`${profile.current_city} ${profile.current_state}`);
    const canRelocate = isYes(profile.willing_to_relocate) || norm(profile.remote_pref).includes("remote");
    const locationKnown = loc.split(/[,/]/)[0].trim();
    const matchesPref = !!locationKnown && (prefLocs.includes(locationKnown) || here.includes(locationKnown));
    const risk = !remoteRole && !matchesPref && !canRelocate;
    items.push({ category: "location", label: "Location / relocation", value: app.location, risk,
      note: risk ? "On-site role outside your stated locations, with relocation not confirmed." : "" });
  }
  // Citizenship / export control for defense-adjacent employers.
  if (app?.company_name && DEFENSE.test(app.company_name)) {
    const risk = !norm(profile.work_auth).includes("citizen");
    items.push({ category: "export_control", label: "Citizenship / export-control", value: profile.work_auth ?? "not set", risk,
      note: risk ? "Defense-adjacent roles often require US citizenship (ITAR/export control)." : "" });
  }

  return items.sort((a, b) => Number(b.risk) - Number(a.risk));
}

const parseTs = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

/** Rejections that came back fast enough to suspect an automated screen. */
export function fastRejections(apps: ApplicationRow[], profile: Profile | null, maxHours = 24): FastRejection[] {
  const out: FastRejection[] = [];
  for (const app of apps) {
    if (app.status !== "rejected") continue;
    const end = parseTs(app.result_date);
    const start = parseTs(app.applied_at) ?? parseTs(app.date_applied) ?? parseTs(app.discovered_at);
    if (end == null || start == null) continue;
    const hours = (end - start) / 3_600_000;
    if (hours < 0 || hours > maxHours) continue;
    out.push({
      app, hoursToResult: hours,
      likelihood: hours < 1 ? "very likely" : "possibly",
      items: screeningItems(profile, app),
    });
  }
  return out.sort((a, b) => a.hoursToResult - b.hoursToResult);
}

export function humanDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
