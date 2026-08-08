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

export interface AtsCategory { key: string; name: string; score: number; max: number; note: string }
export interface AtsResult { overall: number; categories: AtsCategory[]; fixes: string[]; source: Source }

// Weighted rubric (sums to 100). Blends ATS-parseability with candidate substance,
// inspired by interviewstreet/hiring-agent's role-based weighted categories (MIT).
const ATS_RUBRIC = [
  { key: "format", name: "Parseability & format", max: 20 },
  { key: "skills", name: "Skills & keyword match", max: 25 },
  { key: "impact", name: "Impact & quantification", max: 25 },
  { key: "experience", name: "Experience & projects", max: 20 },
  { key: "education", name: "Education & extras", max: 10 },
] as const;

const ACTION_VERBS = /^\s*[-•*]?\s*(built|created|developed|designed|shipped|launched|led|implemented|improved|increased|reduced|optimized|automated|architected|engineered|delivered|deployed|scaled|migrated|refactored|analyzed|drove|owned|initiated|spearheaded)/i;

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

// ---------- 4. ATS Score ----------
export async function atsScore(resume: string, jd?: string): Promise<AtsResult> {
  if (!resume.trim()) throw new Error("Pick a résumé with text first.");
  if (!hasApiKey()) return offlineAts(resume, jd);
  const rubric = ATS_RUBRIC.map((c) => `${c.key} (max ${c.max}): ${c.name}`).join("; ");
  const out = await chat<Omit<AtsResult, "source">>(
    `You are an ATS + technical recruiter scoring a résumé for a software-engineering internship. Score each category from 0 to its max based ONLY on the résumé${jd ? " and the target job description" : ""}. Categories: ${rubric}. Also give the overall (sum) and 3-5 concrete fixes. Respond ONLY with JSON: { "overall": number, "categories": [{ "key": string, "name": string, "score": number, "max": number, "note": string }], "fixes": string[] }.`,
    `RESUME:\n${resume.slice(0, 8000)}${jd ? `\n\nJOB DESCRIPTION:\n${jd.slice(0, 4000)}` : ""}`,
  );
  // Clamp scores to each category max; recompute overall so it's always consistent.
  const categories = ATS_RUBRIC.map((r) => {
    const c = out.categories?.find((x) => x.key === r.key);
    return { key: r.key, name: r.name, max: r.max, score: Math.max(0, Math.min(r.max, Math.round(c?.score ?? 0))), note: c?.note ?? "" };
  });
  return { overall: categories.reduce((s, c) => s + c.score, 0), categories, fixes: out.fixes ?? [], source: "openai" };
}

function offlineAts(resume: string, jd?: string): AtsResult {
  const text = resume.toLowerCase();
  const lines = resume.split(/\n/);
  const bullets = lines.filter((l) => /^\s*[-•*]/.test(l));
  const has = (re: RegExp) => re.test(text);
  const fixes: string[] = [];

  // format
  let format = 0;
  const sections = [/experience|employment|work history/, /education/, /skills|technical/, /projects/].filter(has).length;
  format += sections * 4; // up to 16
  const contact = (/@/.test(resume) ? 1 : 0) + (/linkedin|github/.test(text) ? 1 : 0) + (/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(resume) ? 1 : 0);
  format += Math.min(4, contact * 2);
  format = Math.min(20, format);
  if (sections < 4) fixes.push("Add clear section headings — Experience, Education, Skills, Projects.");
  if (contact < 2) fixes.push("Add complete contact info (email, phone, LinkedIn/GitHub).");

  // skills
  const m = jdSkillMatch(jd || resume, resume);
  const skills = jd ? Math.round((m.score / 100) * 25) : Math.min(25, Math.round(m.matched.length * 2.2));
  if (jd && m.missing.length) fixes.push(`Weave in JD keywords you have experience with: ${m.missing.slice(0, 5).join(", ")}.`);

  // impact
  const withNum = bullets.filter((b) => /\d/.test(b)).length;
  const withVerb = bullets.filter((b) => ACTION_VERBS.test(b)).length;
  const denom = Math.max(1, bullets.length);
  const impact = Math.round(((withNum / denom) * 0.6 + (withVerb / denom) * 0.4) * 25);
  if (bullets.length && withNum / denom < 0.5) fixes.push("Add a number/metric to more bullets (%, count, time saved).");

  // experience / projects
  let experience = 0;
  if (has(/intern|internship/)) experience += 8;
  if (has(/project/)) experience += 6;
  if (has(/github|open source|open-source/)) experience += 3;
  if (bullets.length >= 6) experience += 3;
  experience = Math.min(20, experience);

  // education & extras
  let education = 0;
  if (has(/education|university|college|b\.?s\.?|degree/)) education += 5;
  if (has(/20\d\d/)) education += 2; // a year (grad/date)
  if (has(/gpa/)) education += 1;
  if (has(/coursework|relevant courses/)) education += 2;
  education = Math.min(10, education);

  const categories: AtsCategory[] = [
    { key: "format", name: "Parseability & format", score: format, max: 20, note: `${sections}/4 sections, contact ${contact}/3` },
    { key: "skills", name: "Skills & keyword match", score: skills, max: 25, note: jd ? `${m.score}% JD keyword coverage` : `${m.matched.length} known skills detected` },
    { key: "impact", name: "Impact & quantification", score: impact, max: 25, note: `${withNum}/${bullets.length || 0} bullets have a metric` },
    { key: "experience", name: "Experience & projects", score: experience, max: 20, note: "internships, projects, open-source signals" },
    { key: "education", name: "Education & extras", score: education, max: 10, note: "degree, dates, coursework" },
  ];
  if (fixes.length === 0) fixes.push("Solid on the offline checks — run the AI score for a deeper read.");
  return { overall: categories.reduce((s, c) => s + c.score, 0), categories, fixes, source: "stub" };
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
