import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";
import type { ResumeMatchInput, ResumeMatchResult } from "./types";

const COMMON_STOPWORDS = new Set([
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
      .filter((w) => w.length >= 3 && !COMMON_STOPWORDS.has(w)),
  );
}

/**
 * Offline, deterministic fallback so the resume-match feature is demoable
 * without an API key. Uses keyword overlap between the JD and the resume.
 */
function stubMatch(input: ResumeMatchInput): ResumeMatchResult {
  const jdTokens = [...tokenize(input.jobDescription)];
  const resumeTokens = tokenize(input.resumeText);

  const matchingSkills = jdTokens.filter((t) => resumeTokens.has(t));
  const missingSkills = jdTokens.filter((t) => !resumeTokens.has(t));
  const matchScore = jdTokens.length
    ? Math.round((matchingSkills.length / jdTokens.length) * 100)
    : 0;

  return {
    matchScore,
    matchingSkills: matchingSkills.slice(0, 15),
    missingSkills: missingSkills.slice(0, 15),
    weakBullets: [
      "Bullets that describe duties rather than measurable impact.",
      "Bullets missing the technologies named in the job description.",
    ],
    suggestedBullets: missingSkills.slice(0, 3).map((skill) => ({
      before: `Worked on projects involving ${skill}.`,
      after: `Built and shipped a ${skill}-based feature, improving a measurable outcome (add a concrete number).`,
    })),
    strategy:
      "Offline estimate (no API key set). Add an OpenAI key in Settings for a real, role-specific analysis. " +
      `Focus on weaving the missing keywords into real experience: ${missingSkills.slice(0, 5).join(", ")}.`,
    source: "stub",
  };
}

const SYSTEM_PROMPT =
  "You are a resume optimization assistant for software engineering internship applicants. " +
  "Compare the candidate's resume to a job description. Never fabricate experience; only suggest " +
  "clearer, stronger phrasing of real experience and identify genuine gaps. " +
  "Respond ONLY with JSON matching the requested schema.";

function buildUserPrompt(input: ResumeMatchInput): string {
  return `TARGET ROLE: ${input.targetRole || "(not specified)"}

JOB DESCRIPTION:
${input.jobDescription}

RESUME:
${input.resumeText}

Return JSON with this exact shape:
{
  "matchScore": number (0-100),
  "matchingSkills": string[],
  "missingSkills": string[],
  "weakBullets": string[],
  "suggestedBullets": [{ "before": string, "after": string }],
  "strategy": string
}`;
}

async function openaiMatch(input: ResumeMatchInput): Promise<ResumeMatchResult> {
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
        { role: "user", content: buildUserPrompt(input) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);

  return {
    matchScore: Number(parsed.matchScore) || 0,
    matchingSkills: parsed.matchingSkills ?? [],
    missingSkills: parsed.missingSkills ?? [],
    weakBullets: parsed.weakBullets ?? [],
    suggestedBullets: parsed.suggestedBullets ?? [],
    strategy: parsed.strategy ?? "",
    source: "openai",
  };
}

/**
 * Analyze a resume against a job description. Uses OpenAI when a key is set,
 * otherwise falls back to the offline keyword estimate.
 */
export async function matchResume(input: ResumeMatchInput): Promise<ResumeMatchResult> {
  if (!hasApiKey()) return stubMatch(input);
  return openaiMatch(input);
}
