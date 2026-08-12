/**
 * Relationship graph + best-path scoring. Works over your existing contacts and
 * referrals (the contact↔application edges, which already carry an outreach
 * state machine). The point: for any company, surface the strongest warm path
 * you have — "You → Centre College → alumnus → Backend Engineer — 88/100" — and
 * flag outreach that's gone stale.
 */
import { scoreContact, extractTeam, type ScoredContact } from "./connections";
import type { TeamExtract } from "./connections";
import type { ContactEmployment } from "../db/contactHistory";
import type { ContactRow, Profile, ReferralRow, RelationshipType } from "../db/types";

/** The "via" hop of a path — how you know this person. */
export function relationshipVia(rel: RelationshipType | null, profile: Profile | null): string {
  switch (rel) {
    case "alumnus": return profile?.school?.trim() || "your school";
    case "previous_coworker": return "a former employer";
    case "friend": return "a friend";
    case "professor_connection": return "a professor";
    case "cold_outreach": return "cold outreach";
    default: return "your network";
  }
}

export interface BestPath { scored: ScoredContact; path: string }
/** The strongest warm connection at a company, framed as a path. Null if none. */
export function bestConnection(contacts: ContactRow[], team: TeamExtract, profile: Profile | null): BestPath | null {
  if (!contacts.length) return null;
  const top = contacts.map((c) => scoreContact(c, team)).sort((a, b) => b.score - a.score)[0];
  const via = relationshipVia(top.contact.relationship_type, profile);
  const title = top.contact.title ? ` → ${top.contact.title}` : "";
  return { scored: top, path: `You → ${via} → ${top.contact.name}${title}` };
}

function daysSince(d?: string | null): number | null {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

export interface StaleItem { referral: ReferralRow; reason: string; severity: "warn" | "info" }
/** Outreach that needs action: agreed-but-unconfirmed, gone-quiet, or follow-up due. */
export function staleReferrals(referrals: ReferralRow[]): StaleItem[] {
  const out: StaleItem[] = [];
  for (const r of referrals) {
    const since = daysSince(r.last_interaction ?? r.first_contacted);
    const followDue = r.next_follow_up != null && (daysSince(r.next_follow_up) ?? -1) >= 0;
    if (r.status === "referral_agreed") out.push({ referral: r, reason: "Referral agreed — no confirmation recorded", severity: "warn" });
    else if (r.status === "referral_confirmed" && r.thank_you_sent === 0) out.push({ referral: r, reason: "Referral confirmed — send a thank-you", severity: "info" });
    else if ((r.status === "outreach_sent" || r.status === "contact_responded") && since != null && since >= 5) out.push({ referral: r, reason: `Quiet for ${since}d — follow up`, severity: "warn" });
    else if (r.status === "potential_contact" && (since == null || since >= 2)) out.push({ referral: r, reason: "Identified, not contacted yet", severity: "info" });
    else if (followDue) out.push({ referral: r, reason: "Follow-up due", severity: "warn" });
  }
  return out;
}

/** Grouped view of your warm paths, for a company or overall network map. */
export interface PathGroup { via: string; count: number; companies: string[] }
export function networkPaths(contacts: ContactRow[], profile: Profile | null): PathGroup[] {
  const byVia = new Map<string, { companies: Set<string> }>();
  for (const c of contacts) {
    const via = relationshipVia(c.relationship_type, profile);
    const e = byVia.get(via) ?? { companies: new Set<string>() };
    if (c.company_name) e.companies.add(c.company_name);
    byVia.set(via, e);
  }
  return [...byVia.entries()]
    .map(([via, e]) => ({ via, count: e.companies.size, companies: [...e.companies].sort() }))
    .sort((a, b) => b.count - a.count);
}

// ── network map: You → channel → companies (each under its strongest path) ──
export interface MapCompany { name: string; score: number }
export interface MapChannel { via: string; companies: MapCompany[] }

/** Build the You→channel→companies map, placing each company under the channel
 *  of its strongest contact and scoring it with the best-path score. Uses current
 *  company AND employment history, so people who moved jobs still map correctly. */
export function networkMap(contacts: ContactRow[], employment: ContactEmployment[], profile: Profile | null): MapChannel[] {
  const empByContact = new Map<number, string[]>();
  for (const e of employment) { const a = empByContact.get(e.contact_id) ?? []; a.push(e.company); empByContact.set(e.contact_id, a); }

  const display = new Map<string, string>(); // lowercased → display name
  const byCompany = new Map<string, ContactRow[]>();
  const add = (name: string, c: ContactRow) => {
    const lc = name.trim().toLowerCase(); if (!lc) return;
    if (!display.has(lc)) display.set(lc, name.trim());
    const a = byCompany.get(lc) ?? []; if (!a.includes(c)) a.push(c); byCompany.set(lc, a);
  };
  for (const c of contacts) {
    if (c.company_name) add(c.company_name, c);
    for (const comp of empByContact.get(c.id) ?? []) add(comp, c);
  }

  const team = extractTeam("Software Engineer Intern");
  const channels = new Map<string, MapCompany[]>();
  for (const [lc, cs] of byCompany) {
    const best = bestConnection(cs, team, profile);
    if (!best) continue;
    const via = relationshipVia(best.scored.contact.relationship_type, profile);
    (channels.get(via) ?? channels.set(via, []).get(via)!).push({ name: display.get(lc)!, score: best.scored.score });
  }
  return [...channels.entries()]
    .map(([via, comps]) => ({ via, companies: comps.sort((a, b) => b.score - a.score) }))
    .sort((a, b) => b.companies.length - a.companies.length);
}
