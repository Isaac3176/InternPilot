/**
 * Draft a reusable answer-vault entry, grounded in the user's own résumé bullets
 * and profile. Uses OpenAI when a key is set; otherwise a deterministic offline
 * template so drafting works without an API key. Answers are written to be
 * REUSABLE across applications — specifics use a "[Company]" placeholder — and
 * are always reviewed by the user before they're approved for reuse.
 */
import { getProfile } from "../db/profile";
import { listResumeBullets } from "../db/resumes";
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

export interface DraftResult {
  text: string;
  source: "openai" | "stub";
}

interface DraftContext {
  name: string;
  school: string;
  major: string;
  grad: string;
  skills: string[];
  roles: string[];
  bullets: string[];
}

async function gatherContext(): Promise<DraftContext> {
  const [profile, bullets] = await Promise.all([getProfile(), listResumeBullets()]);
  const split = (v: string | null | undefined) => (v ?? "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  return {
    name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
    school: profile?.school ?? "",
    major: profile?.major ?? "",
    grad: profile?.grad_year ?? profile?.graduation_date ?? "",
    skills: split(profile?.skills),
    roles: split(profile?.target_roles),
    bullets: bullets
      .map((b) => (b.improved_text || b.original_text || "").trim())
      .filter(Boolean)
      .slice(0, 8),
  };
}

const SYSTEM_PROMPT =
  "You write reusable first-person answers to internship application questions for a student. " +
  "Ground every claim in the applicant's provided résumé bullets and profile — never invent experience. " +
  "Keep it concise (90-140 words unless the question implies shorter), specific, and genuine — no clichés. " +
  "Because the answer is reused across companies, use a \"[Company]\" placeholder (and \"[role]\" if needed) " +
  "instead of naming a specific employer. Respond ONLY with JSON: { \"answer\": string }.";

async function openaiDraft(question: string, ctx: DraftContext): Promise<DraftResult> {
  const prompt = `APPLICANT
Name: ${ctx.name || "(n/a)"}
School / Major: ${ctx.school} ${ctx.major ? `— ${ctx.major}` : ""}
Graduation: ${ctx.grad || "(n/a)"}
Target roles: ${ctx.roles.join(", ") || "(n/a)"}
Skills: ${ctx.skills.join(", ") || "(n/a)"}
Résumé bullets:
${ctx.bullets.length ? ctx.bullets.map((b) => `- ${b}`).join("\n") : "(none provided)"}

QUESTION: ${question}

Return JSON: { "answer": string }`;

  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  return { text: (parsed.answer ?? "").trim(), source: "openai" };
}

/** Deterministic starting draft when there's no API key. */
function stubDraft(question: string, ctx: DraftContext): DraftResult {
  const q = question.toLowerCase();
  const topBullet = ctx.bullets[0] ?? "a project where I shipped something end to end";
  const skills = ctx.skills.slice(0, 4).join(", ") || "software engineering";
  const roleFocus = ctx.roles[0] ?? "software engineering";
  const who = `I'm ${ctx.name || "a"} ${ctx.major ? `${ctx.major} ` : ""}student${ctx.school ? ` at ${ctx.school}` : ""}${ctx.grad ? `, graduating ${ctx.grad}` : ""}`;

  let text: string;
  if (/why.*(company|work here|join|interested)/.test(q)) {
    text = `I'm excited about [Company] because it's building things I'd genuinely use, and the work maps closely to what I've focused on — ${skills}. In one project, ${lower(topBullet)}, and I'd bring that same hands-on approach to your team. I'm looking to learn from strong engineers while contributing from day one.`;
  } else if (/why.*(role|position|this job)/.test(q)) {
    text = `This ${roleFocus} role lines up with where I want to grow. ${cap(topBullet)} — that kind of work is exactly what I want more of, and [Company]'s scale would push me further. I care about writing code that ships and gets used.`;
  } else if (/challeng|difficult|technical project|proud|hardest/.test(q)) {
    text = `${cap(topBullet)}. It was challenging because I had to learn as I built and make tradeoffs under real constraints. I broke the problem into pieces, validated as I went, and leaned on ${skills} to get it working — and shipped something I was proud of.`;
  } else if (/leader|team|conflict|collaborat/.test(q)) {
    text = `${cap(topBullet)}. Working with others, I focused on clear communication and owning my part end to end. When we disagreed, I tried to ground the discussion in what the user actually needed, which kept us moving.`;
  } else if (/about yourself|tell us about you|introduce/.test(q)) {
    text = `${who}, focused on ${roleFocus}. I like turning ideas into working software — for example, ${lower(topBullet)}. I'm strongest in ${skills}, and I'm looking for an internship where I can build real things and learn from a great team.`;
  } else if (/looking for|hope to (gain|learn)|goals/.test(q)) {
    text = `I'm looking for an internship where I can contribute to real projects and grow as an engineer. I want to sharpen my ${skills}, learn how strong teams ship at scale, and leave having made something people use.`;
  } else if (/strength/.test(q)) {
    text = `My biggest strength is turning ambiguous problems into shipped software. ${cap(topBullet)} — I stayed practical, learned what I needed, and delivered. I'm comfortable across ${skills}.`;
  } else if (/good fit|why should we|what makes you|stand ?out/.test(q)) {
    text = `I'd be a strong fit for [Company] because I pair ${skills} with a bias toward shipping. ${cap(topBullet)}, and I'd bring that ownership here. I learn fast and care about the details that make software actually good.`;
  } else {
    text = `${who}. ${cap(topBullet)}. I'm strongest in ${skills} and looking for a ${roleFocus} internship where I can contribute and keep growing. (Draft — edit to fit the exact question.)`;
  }
  return { text, source: "stub" };
}

function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function lower(s: string): string { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

export async function draftAnswer(question: string): Promise<DraftResult> {
  const q = (question || "").trim();
  if (!q) throw new Error("Add the question first, then draft.");
  const ctx = await gatherContext();
  if (!hasApiKey()) return stubDraft(q, ctx);
  return openaiDraft(q, ctx);
}
