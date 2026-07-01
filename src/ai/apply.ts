import type { ResumeVersion } from "../db/types";
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "our", "are", "will", "your", "this", "that",
  "have", "from", "their", "they", "has", "was", "but", "not", "all", "can", "who",
  "experience", "work", "team", "role", "job", "ability", "strong", "years", "year",
  "including", "etc", "such", "into", "across", "using", "use", "well", "must",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

export interface ResumeRecommendation {
  id: number;
  name: string;
  score: number; // 0-100 keyword overlap with the job description
}

/**
 * Rank resume versions by keyword overlap with the job description (local, no API).
 * Versions without content score 0.
 */
export function recommendResume(jobDescription: string, versions: ResumeVersion[]): ResumeRecommendation[] {
  const jd = [...tokenize(jobDescription)];
  return versions
    .map((v) => {
      const resume = tokenize(v.content ?? "");
      const matched = jd.filter((t) => resume.has(t)).length;
      const score = jd.length ? Math.round((matched / jd.length) * 100) : 0;
      return { id: v.id, name: v.name, score };
    })
    .sort((a, b) => b.score - a.score);
}

export interface ApplyAssist {
  shortAnswers: { question: string; answer: string }[];
  checklist: string[];
  source: "openai" | "stub";
}

export interface ApplyInput {
  company: string;
  role: string;
  jobDescription?: string | null;
  resumeText?: string | null;
  customQuestion?: string | null;
}

const DEFAULT_QUESTIONS = [
  "Why are you interested in this role and company?",
  "What relevant experience or projects make you a strong fit?",
  "Describe a technical challenge you solved.",
  "Why should we select you for this internship?",
];

function stubAssist(input: ApplyInput): ApplyAssist {
  const questions = [...DEFAULT_QUESTIONS];
  if (input.customQuestion?.trim()) questions.push(input.customQuestion.trim());
  return {
    shortAnswers: questions.map((q) => ({
      question: q,
      answer: `Draft offline. Add an OpenAI key in Settings to generate a tailored answer for "${q}" grounded in your resume and the ${input.role || "role"} at ${input.company || "the company"}.`,
    })),
    checklist: [
      "Pick the best-matching resume version (see recommendation).",
      "Tailor the resume bullets to the job description.",
      "Proofread for typos and consistent formatting.",
      "Prepare links: GitHub, portfolio, LinkedIn.",
      "Draft answers to the application's short-answer questions.",
      "Note the application deadline.",
      "Review everything, then submit on the company site.",
    ],
    source: "stub",
  };
}

const SYSTEM_PROMPT =
  "You help a software engineering internship applicant prepare an application. Draft concise, " +
  "honest short-answer responses grounded ONLY in the provided resume and job description — never " +
  "fabricate experience. Also produce a tailored preparation checklist. Respond ONLY with JSON.";

function buildPrompt(input: ApplyInput): string {
  const extra = input.customQuestion?.trim() ? `\nAlso answer this custom question: "${input.customQuestion.trim()}"` : "";
  return `COMPANY: ${input.company || "(unknown)"}
ROLE: ${input.role || "(unknown)"}

JOB DESCRIPTION:
${input.jobDescription || "(none provided)"}

RESUME:
${input.resumeText || "(none provided)"}

Draft answers to these questions: ${JSON.stringify(DEFAULT_QUESTIONS)}${extra}

Return JSON with this exact shape:
{
  "shortAnswers": [{ "question": string, "answer": string }],
  "checklist": string[]
}`;
}

async function openaiAssist(input: ApplyInput): Promise<ApplyAssist> {
  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(input) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  return {
    shortAnswers: parsed.shortAnswers ?? [],
    checklist: parsed.checklist ?? [],
    source: "openai",
  };
}

export async function generateApplyAssist(input: ApplyInput): Promise<ApplyAssist> {
  if (!hasApiKey()) return stubAssist(input);
  return openaiAssist(input);
}
