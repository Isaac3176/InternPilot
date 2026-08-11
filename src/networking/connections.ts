/**
 * Connection Intelligence — for a saved job, work out WHO is worth contacting,
 * WHY, and HOW to find them on LinkedIn/Google. We never pretend to know who
 * works at a company; instead we turn the job + your profile into a small,
 * prioritized set of high-signal searches so finding the right 3-5 people is fast.
 */
import type { ContactRow, Profile, RelationshipType } from "../db/types";

// ── team extraction ─────────────────────────────────────────────────────────
interface Domain { area: string; kws: string[]; people: string[] }
const DOMAINS: Domain[] = [
  { area: "Security", kws: ["security", "appsec", "infosec", "vulnerab", "threat", "abuse", "bot ", "fraud", "authentication", "detection"], people: ["Security Engineer", "Software Engineer, Security", "Abuse", "Bot Management", "Detection"] },
  { area: "Distributed Systems", kws: ["distributed", "consensus", "replication", "fault-toler", "high availability", "at scale", "throughput"], people: ["Distributed Systems", "Backend Engineer", "Platform Engineer"] },
  { area: "Backend / Platform", kws: ["backend", "back-end", "server-side", "api", "microservice", "platform", "service", "grpc"], people: ["Backend Engineer", "Platform Engineer", "Software Engineer, Backend"] },
  { area: "Machine Learning", kws: ["machine learning", " ml ", "deep learning", "nlp", "model training", "inference", "recommendation", "llm"], people: ["Machine Learning Engineer", "ML Engineer", "Research Engineer"] },
  { area: "Data / Infra", kws: ["data pipeline", "etl", "spark", "kafka", "warehouse", "big data", "streaming", "airflow"], people: ["Data Engineer", "Software Engineer, Data", "Analytics Engineer"] },
  { area: "Frontend", kws: ["frontend", "front-end", "react", "user interface", " ui ", "web app", "typescript", "next.js"], people: ["Frontend Engineer", "Software Engineer, Frontend", "Web Engineer"] },
  { area: "Mobile", kws: ["ios", "android", "mobile app", "swift", "kotlin", "react native"], people: ["Mobile Engineer", "iOS Engineer", "Android Engineer"] },
  { area: "Cloud / Reliability", kws: ["kubernetes", "docker", "aws", "gcp", "azure", "devops", "sre", "reliability", "ci/cd", "terraform"], people: ["Cloud Engineer", "SRE", "Platform Engineer"] },
  { area: "Networking / Edge", kws: ["edge", "cdn", "traffic", "dns", "proxy", "latency", "packet", "network"], people: ["Network Engineer", "Edge", "Software Engineer, Networking"] },
  { area: "Databases / Storage", kws: ["database", "postgres", "storage", " index", "transaction", "query engine", "kv store"], people: ["Database Engineer", "Storage Engineer", "Software Engineer, Storage"] },
  { area: "Payments / Fintech", kws: ["payment", "ledger", "settlement", "fintech", "banking", "transaction"], people: ["Software Engineer, Payments", "Backend Engineer"] },
];

export interface TeamExtract { areas: string[]; keywords: string[] }
export function extractTeam(title: string, jd?: string): TeamExtract {
  const hay = `${title} ${jd ?? ""}`.toLowerCase();
  const areas: string[] = [];
  const keywords = new Set<string>();
  for (const d of DOMAINS) {
    if (d.kws.some((k) => hay.includes(k))) {
      areas.push(d.area);
      d.people.forEach((p) => keywords.add(p));
    }
  }
  if (areas.length === 0) keywords.add("Software Engineer");
  return { areas, keywords: [...keywords].slice(0, 8) };
}

// ── search URL builders ─────────────────────────────────────────────────────
const quote = (s: string) => `"${s.replace(/"/g, "")}"`;
/** Build a boolean-ish query string from parts (company always quoted). */
export function q(...parts: string[]): string {
  return parts.filter(Boolean).map((p) => (/\s/.test(p) ? quote(p) : quote(p))).join(" ");
}
export function linkedinUrl(query: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}
export function googleUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in ${query}`)}`;
}

export interface Search { label: string; query: string; linkedin: string; google: string }
function mk(label: string, ...parts: string[]): Search {
  const query = q(...parts);
  return { label, query, linkedin: linkedinUrl(query), google: googleUrl(query) };
}

// ── the who-to-find plan ────────────────────────────────────────────────────
export interface SearchTier { key: string; label: string; priority: number; why: string; searches: Search[] }

export function buildPlan(company: string, title: string, jd: string | undefined, profile: Profile | null): { team: TeamExtract; tiers: SearchTier[] } {
  const team = extractTeam(title, jd);
  const school = profile?.school?.trim();
  const kw = team.keywords;
  const tiers: SearchTier[] = [];

  if (school) {
    tiers.push({
      key: "alumni", label: `${school} alumni at ${company}`, priority: 95,
      why: "You share a real reason to reach out — warm, high response rate. Start here.",
      searches: [mk(`${school} alumni at ${company}`, company, school)],
    });
  }

  tiers.push({
    key: "engineers", label: "Engineers doing the relevant work", priority: 85,
    why: team.areas.length ? `Matched from the posting: ${team.areas.join(", ")}. They can tell you about the team and may refer you later.` : "Engineers on this kind of role — ask a specific question, don't lead with a referral.",
    searches: kw.slice(0, 4).map((k) => mk(`${k} at ${company}`, company, k)),
  });

  tiers.push({
    key: "interns", label: "Former SWE interns (now full-time)", priority: 80,
    why: "Underrated: they just did the process you're about to, and are usually the most approachable.",
    searches: [mk(`Former interns at ${company}`, company, "Software Engineer Intern")],
  });

  tiers.push({
    key: "recruiters", label: "University / early-career recruiters", priority: 75,
    why: "Student recruiting is literally their job — better than generic recruiters. Intro + role/job ID + one-line qualification.",
    searches: [
      mk(`University recruiter at ${company}`, company, "University Recruiter"),
      mk(`Early careers at ${company}`, company, "Early Careers"),
    ],
  });

  tiers.push({
    key: "managers", label: "Engineering managers on the team", priority: 60,
    why: "Only when the team clearly aligns with the posting — don't blast random managers.",
    searches: [mk(`EM at ${company}`, company, "Engineering Manager", team.areas[0] ?? "")],
  });

  return { team, tiers };
}

// ── outreach guidance ───────────────────────────────────────────────────────
export function recommendedAction(rel: RelationshipType | null): string {
  switch (rel) {
    case "previous_coworker": return "Knows your work — a direct referral request is appropriate.";
    case "alumnus": return "Ask about their experience & the team first; the referral comes later.";
    case "friend": return "Casual ask is fine — mention the role and ask if they'd introduce you.";
    case "professor_connection": return "Ask for an intro to someone on the team, or their read on the group.";
    case "cold_outreach": return "Lead with a specific technical/team question — don't open with a referral.";
    default: return "Ask a specific question about the team before anything else.";
  }
}

// ── scoring your existing contacts against a job ─────────────────────────────
export interface ScoredContact { contact: ContactRow; score: number; reasons: string[]; action: string }

export function scoreContact(c: ContactRow, team: TeamExtract): ScoredContact {
  let score = 20; // already at the target company (this list is pre-filtered to it)
  const reasons: string[] = ["Works at the company"];
  const title = (c.title ?? "").toLowerCase();
  const relPts: Record<string, number> = { alumnus: 30, previous_coworker: 25, friend: 15, professor_connection: 15, cold_outreach: 3, other: 5 };
  if (c.relationship_type) {
    score += relPts[c.relationship_type] ?? 5;
    if (c.relationship_type === "alumnus") reasons.push("Same school");
    else if (c.relationship_type === "previous_coworker") reasons.push("Former coworker — knows your work");
  }
  if (/recruit/.test(title)) { score += 15; reasons.push("Recruiter"); }
  else if (/manager|lead|director/.test(title)) { score += 10; reasons.push("Manager"); }
  else if (/intern/.test(title)) { score += 12; reasons.push("Recent intern"); }
  const hay = `${title} ${(c.team ?? "").toLowerCase()}`;
  if (team.areas.some((a) => hay.includes(a.toLowerCase().split(" ")[0])) || team.keywords.some((k) => hay.includes(k.toLowerCase().split(",")[0]))) {
    score += 20; reasons.push("On a relevant team");
  }
  if (c.relationship_strength) score += Math.min(10, c.relationship_strength * 2);
  if (/vp|vice president|chief|cto|ceo|head of/.test(title)) { score -= 20; reasons.push("Senior exec — lower priority"); }
  return { contact: c, score: Math.max(0, Math.min(100, score)), reasons, action: recommendedAction(c.relationship_type) };
}

// ── networking checklist (persisted per company) ─────────────────────────────
export interface ChecklistStep { id: string; group: string; label: string }
export function checklistFor(company: string, hasSchool: boolean): ChecklistStep[] {
  return [
    ...(hasSchool ? [{ id: "warm-alumni", group: "Warm network", label: "Search your school's alumni at the company" }] : []),
    { id: "warm-contacts", group: "Warm network", label: "Check contacts you already have here" },
    { id: "team-eng", group: "Team", label: "Find 2 engineers on the relevant team" },
    { id: "team-intern", group: "Team", label: "Find 1 former SWE intern" },
    { id: "rec", group: "Recruiting", label: "Find a university / early-career recruiter" },
    { id: "out-connect", group: "Outreach", label: "Send connection requests to your strongest 3" },
    { id: "out-ask", group: "Outreach", label: "Ask about their experience / the team" },
    { id: "out-follow", group: "Outreach", label: "Follow up after 4-5 days" },
    { id: "out-referral", group: "Outreach", label: "Ask for a referral when appropriate" },
    { id: "app-submit", group: "Application", label: `Apply to ${company} once the path is warm` },
  ];
}

const CK = (company: string) => `internpilot.netcheck.${company.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
export function getChecklistState(company: string): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CK(company)) ?? "{}"); } catch { return {}; }
}
export function setChecklistState(company: string, state: Record<string, boolean>): void {
  try { localStorage.setItem(CK(company), JSON.stringify(state)); } catch { /* ignore */ }
}
