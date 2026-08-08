/**
 * Résumé Lab: three AI tools over a résumé (± a target job description).
 *   gapFinder    — missing keywords / weak verbs / vague claims vs. what's there
 *   rewriteResume — tailor the résumé to the JD without inventing anything
 *   redFlagScan  — a recruiter's 6-second read: what stands out, what to cut
 * OpenAI when a key is set; deterministic offline heuristics otherwise (except
 * rewrite, which needs the model). Outputs are always shown for review.
 */
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";
import { jdSkillMatch } from "../listings/match";

export type Source = "openai" | "stub";

export interface GapRow { item: string; type: string; have: string }
export interface GapResult { rows: GapRow[]; summary: string; source: Source }
export interface RewriteResult { text: string; source: Source }
export interface RedFlagResult {
  firstImpression: string;
  skipReasons: string[];
  cliches: string[];
  fixes: string[];
  source: Source;
}

export interface RankCategory { key: string; label: string; icon: string; score: number; max: number; note: string }
export interface RankResult {
  overall: number;       // final score, clamped to [min, max]
  base: number;          // sum of the four categories (0..100)
  bonus: number;         // exceptional-signal points (0..bonus_max)
  deductions: number;    // penalty points subtracted (>= 0)
  min: number; max: number;
  categories: RankCategory[];
  bonusNotes: string[];
  deductionNotes: string[];
  fixes: string[];
  source: Source;
}

/**
 * A faithful 1:1 port of interviewstreet/hiring-agent's software-engineering-intern
 * role.json (MIT). This is a candidate *ranking* rubric — how HackerRank screens
 * interns — NOT an ATS/parseability check. It deliberately rewards public open-source
 * and self-directed projects above everything else, then production experience, and
 * treats a raw "technical skills" list as almost incidental (10 of 100). A ±bonus and
 * deductions push the final into [-20, 120]. Note: like the original, an LLM run will
 * vary score-to-score — treat it as a rank band, not a precise grade.
 */
export const HR_ROLE = {
  position_title: "Software Intern position at HackerRank",
  categories: [
    { key: "open_source",      label: "Open Source",         icon: "🌐", max: 35 },
    { key: "self_projects",    label: "Self Projects",        icon: "🚀", max: 30 },
    { key: "production",       label: "Production Experience", icon: "🏢", max: 25 },
    { key: "technical_skills", label: "Technical Skills",     icon: "💻", max: 10 },
  ],
  bonus_max: 20,
  min_final_score: -20,
  max_final_score: 120,
} as const;

const WEAK_VERBS = ["helped", "worked on", "responsible for", "assisted", "participated", "involved in", "handled", "dealt with", "was tasked", "duties included"];
const CLICHES = ["hard-working", "hard working", "team player", "detail-oriented", "detail oriented", "results-driven", "results driven", "go-getter", "self-starter", "think outside the box", "synergy", "fast learner", "passionate", "motivated individual", "proven track record", "dynamic", "wear many hats"];

async function chat<T>(system: string, user: string): Promise<T> {
  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return JSON.parse(data?.choices?.[0]?.message?.content ?? "{}") as T;
}

// ---------- 1. Gap Finder ----------
export async function gapFinder(resume: string, jd: string): Promise<GapResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!jd.trim()) throw new Error("Paste the target job description first.");
  if (!hasApiKey()) {
    const m = jdSkillMatch(jd, resume);
    const rows: GapRow[] = m.missing.map((k) => ({ item: k, type: "keyword", have: "not on your résumé" }));
    for (const v of WEAK_VERBS) if (new RegExp(`\\b${v}\\b`, "i").test(resume)) rows.push({ item: `Weak verb: "${v}"`, type: "weak verb", have: "replace with an action verb" });
    return {
      rows,
      summary: `${m.missing.length} JD keyword(s) missing, ${m.matched.length} already present. Add an OpenAI key for a deeper gap analysis.`,
      source: "stub",
    };
  }
  return {
    ...(await chat<Omit<GapResult, "source">>(
      "You are a resume gap analyst. Compare a resume to a target job description. Identify EVERY gap: missing keywords, weak verbs, vague claims, and skills the JD wants that the resume doesn't mention. Do not invent skills. Respond ONLY with JSON: { \"summary\": string, \"rows\": [{ \"item\": string, \"type\": \"keyword\"|\"weak verb\"|\"vague claim\"|\"missing skill\", \"have\": string }] }.",
      `RESUME:\n${resume.slice(0, 6000)}\n\nJOB DESCRIPTION:\n${jd.slice(0, 6000)}`,
    )),
    source: "openai",
  };
}

// ---------- 2. One-Click Rewrite ----------
export async function rewriteResume(resume: string, jd: string): Promise<RewriteResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!jd.trim()) throw new Error("Paste the target job description first.");
  if (!hasApiKey()) throw new Error("Rewrite needs an OpenAI key — add one in Settings.");
  const out = await chat<{ resume: string }>(
    "You rewrite a student's resume tailored to a specific job description. Mirror the JD's language and priorities, lead with the most relevant experience, and keep it to one page. CRITICAL: do not invent anything — only reposition and rephrase what's already in the resume. Preserve real facts, companies, and dates. Respond ONLY with JSON: { \"resume\": string } where resume is plain text.",
    `CURRENT RESUME:\n${resume.slice(0, 8000)}\n\nTARGET JOB DESCRIPTION:\n${jd.slice(0, 6000)}`,
  );
  return { text: (out.resume ?? "").trim(), source: "openai" };
}

// ---------- 4. HackerRank-style candidate rank (faithful role.json port) ----------
function clampFinal(base: number, bonus: number, deductions: number): number {
  return Math.max(HR_ROLE.min_final_score, Math.min(HR_ROLE.max_final_score, base + bonus - deductions));
}

export async function hrRank(resume: string, jd?: string): Promise<RankResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!hasApiKey()) return offlineRank(resume, jd);
  const rubric = HR_ROLE.categories.map((c) => `${c.key} (0..${c.max}): ${c.label}`).join("; ");
  const out = await chat<{
    categories?: { key: string; score: number; note?: string }[];
    bonus?: number; bonusNotes?: string[]; deductions?: number; deductionNotes?: string[]; fixes?: string[];
  }>(
    `You are HackerRank's intern hiring screener scoring a candidate for the "${HR_ROLE.position_title}". This is a candidate RANKING, not an ATS check. Score each category from 0 to its max based ONLY on the résumé${jd ? " and the target job description" : ""}. Weights reflect what we value: Open Source (public contributions, merged PRs, maintained repos) and Self Projects (self-directed, shipped, with demos/links) matter most; Production Experience next; a raw skills list matters least. Categories: ${rubric}. Then award bonus points 0..${HR_ROLE.bonus_max} for exceptional signals (competitive-programming wins, notable scale/users, awards, publications) and deductions >= 0 for concerns (no verifiable public work, unexplained gaps, all coursework/no shipped projects). Give 3-5 concrete fixes to raise the rank. Respond ONLY with JSON: { "categories": [{ "key": string, "score": number, "note": string }], "bonus": number, "bonusNotes": string[], "deductions": number, "deductionNotes": string[], "fixes": string[] }.`,
    `RESUME:\n${resume.slice(0, 8000)}${jd ? `\n\nJOB DESCRIPTION:\n${jd.slice(0, 4000)}` : ""}`,
  );
  const categories: RankCategory[] = HR_ROLE.categories.map((r) => {
    const c = out.categories?.find((x) => x.key === r.key);
    return { key: r.key, label: r.label, icon: r.icon, max: r.max, score: Math.max(0, Math.min(r.max, Math.round(c?.score ?? 0))), note: c?.note ?? "" };
  });
  const base = categories.reduce((s, c) => s + c.score, 0);
  const bonus = Math.max(0, Math.min(HR_ROLE.bonus_max, Math.round(out.bonus ?? 0)));
  const deductions = Math.max(0, Math.round(out.deductions ?? 0));
  return {
    overall: clampFinal(base, bonus, deductions), base, bonus, deductions,
    min: HR_ROLE.min_final_score, max: HR_ROLE.max_final_score,
    categories, bonusNotes: out.bonusNotes ?? [], deductionNotes: out.deductionNotes ?? [], fixes: out.fixes ?? [],
    source: "openai",
  };
}

/** Deterministic offline approximation of the role.json rubric (no API key). */
function offlineRank(resume: string, jd?: string): RankResult {
  const text = resume.toLowerCase();
  const has = (re: RegExp) => re.test(text);
  const fixes: string[] = [];
  const cap = (n: number, max: number) => Math.max(0, Math.min(max, n));

  // 🌐 Open Source (35) — public, verifiable contributions weigh heaviest.
  let open_source = 0;
  const hasGithub = /github\.com\//.test(text) || /github/.test(text);
  if (hasGithub) open_source += 10;
  if (has(/open[\s-]?source|contribut(?:ed|ion|or)|pull request|\bpr(?:s)?\b merged|maintainer|\boss\b/)) open_source += 15;
  if (has(/npm|pypi|crates\.io|published (?:a |an )?(?:package|library|gem)|\d+\s*(?:stars|★)/)) open_source += 10;
  open_source = cap(open_source, 35);
  if (open_source < 20) fixes.push("Open source is the #1 signal here — link your GitHub and highlight merged PRs, maintained repos, or published packages.");

  // 🚀 Self Projects (30) — self-directed, shipped work with links/demos.
  let self_projects = 0;
  const projectHits = (text.match(/project/g) || []).length;
  if (projectHits >= 1) self_projects += 12;
  if (projectHits >= 3) self_projects += 8;
  if (has(/hackathon/)) self_projects += 5;
  if (has(/demo|live (?:site|url|link)|deployed at|portfolio|https?:\/\//)) self_projects += 5;
  self_projects = cap(self_projects, 30);
  if (self_projects < 18) fixes.push("Ship 2-3 self-directed projects with live demos or repo links — these count nearly as much as open source.");

  // 🏢 Production Experience (25) — real users / company / internships.
  let production = 0;
  if (has(/intern|internship/)) production += 10;
  if (has(/engineer|developer|swe|full[\s-]?stack|backend|frontend|at\s+[A-Z]/)) production += 8;
  if (has(/production|deployed|in prod|users|customers|scaled|traffic|uptime/)) production += 7;
  production = cap(production, 25);

  // 💻 Technical Skills (10) — breadth, but weighted lightest on purpose.
  const m = jdSkillMatch(jd || resume, resume);
  const technical_skills = jd
    ? cap(Math.round((m.score / 100) * 10), 10)
    : cap(Math.round(m.matched.length * 1.1), 10);

  // + Bonus (0..20) — exceptional signals.
  let bonus = 0; const bonusNotes: string[] = [];
  if (has(/leetcode|codeforces|kaggle|\bicpc\b|competitive programming|1st place|first place|won .* (?:hackathon|competition)/)) { bonus += 6; bonusNotes.push("Competitive programming / contest wins"); }
  if (has(/\b\d{1,3},\d{3}\b|\bmillion\b|\b1m\b|\d+\s*k\+?\s*users|\d+\s*million/)) { bonus += 5; bonusNotes.push("Meaningful scale (users/traffic)"); }
  if (has(/award|honou?r|scholarship|dean'?s list|publication|published paper|arxiv/)) { bonus += 5; bonusNotes.push("Awards / publications"); }
  if (has(/google|meta|facebook|amazon|microsoft|apple|netflix|openai|nvidia|stripe/)) { bonus += 4; bonusNotes.push("Recognizable engineering org"); }
  bonus = cap(bonus, HR_ROLE.bonus_max);

  // − Deductions (>= 0) — concerns, tuned to a GitHub-centric screen.
  let deductions = 0; const deductionNotes: string[] = [];
  if (!hasGithub && open_source === 0) { deductions += 8; deductionNotes.push("No verifiable public/open-source work"); }
  if (projectHits === 0) { deductions += 5; deductionNotes.push("No self-directed projects"); }
  if (!has(/20\d\d|19\d\d/)) { deductions += 4; deductionNotes.push("No dates — timeline unclear"); }

  const categories: RankCategory[] = [
    { key: "open_source", label: "Open Source", icon: "🌐", score: open_source, max: 35, note: hasGithub ? "GitHub + contribution signals" : "no public repos detected" },
    { key: "self_projects", label: "Self Projects", icon: "🚀", score: self_projects, max: 30, note: `${projectHits} project mention${projectHits === 1 ? "" : "s"}` },
    { key: "production", label: "Production Experience", icon: "🏢", score: production, max: 25, note: has(/intern|internship/) ? "internship / real-world signals" : "limited production signals" },
    { key: "technical_skills", label: "Technical Skills", icon: "💻", score: technical_skills, max: 10, note: jd ? `${m.score}% JD skill coverage` : `${m.matched.length} known skills detected` },
  ];
  const base = categories.reduce((s, c) => s + c.score, 0);
  if (fixes.length === 0) fixes.push("Solid on the offline checks — add an OpenAI key for the full screener read.");
  return {
    overall: clampFinal(base, bonus, deductions), base, bonus, deductions,
    min: HR_ROLE.min_final_score, max: HR_ROLE.max_final_score,
    categories, bonusNotes, deductionNotes, fixes, source: "stub",
  };
}

// ---------- 3. Recruiter Red-Flag Scan ----------
export async function redFlagScan(resume: string, jd?: string): Promise<RedFlagResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!hasApiKey()) {
    const found = CLICHES.filter((c) => new RegExp(c.replace(/[-]/g, "[- ]"), "i").test(resume));
    const bullets = resume.split(/\n/).filter((l) => /^[\s]*[-•*]/.test(l));
    const noMetric = bullets.filter((b) => !/\d/.test(b)).length;
    const fixes: string[] = [];
    if (noMetric) fixes.push(`${noMetric} bullet(s) have no number — add a metric (%, count, time saved).`);
    for (const v of WEAK_VERBS) if (new RegExp(`\\b${v}\\b`, "i").test(resume)) { fixes.push(`Replace weak verb "${v}" with an action verb.`); break; }
    if (resume.length > 4200) fixes.push("Reads long for one page — tighten to the strongest points.");
    return {
      firstImpression: "Offline scan — add an OpenAI key for a recruiter-style read.",
      skipReasons: noMetric ? ["Bullets read like duties, not results (missing numbers)."] : [],
      cliches: found,
      fixes: fixes.length ? fixes : ["Looks reasonable on the offline checks — try the AI scan for depth."],
      source: "stub",
    };
  }
  return {
    ...(await chat<Omit<RedFlagResult, "source">>(
      "You are a busy tech recruiter who spends 6 seconds per resume. Read the resume and be brutally specific. Respond ONLY with JSON: { \"firstImpression\": string, \"skipReasons\": string[], \"cliches\": string[], \"fixes\": string[] } — skipReasons = what would make you skip it, cliches = eye-roll phrases to cut, fixes = concrete improvements.",
      `RESUME:\n${resume.slice(0, 8000)}${jd ? `\n\nTARGET ROLE JD (for context):\n${jd.slice(0, 3000)}` : ""}`,
    )),
    source: "openai",
  };
}
