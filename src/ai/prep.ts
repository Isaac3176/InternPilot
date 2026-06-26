import type { InterviewType } from "../db/types";
import { INTERVIEW_TYPE_LABELS } from "../db/types";
import { getApiKey, getModel, hasApiKey } from "./settings";

export interface ScheduleItem {
  when: string;
  focus: string;
}

export interface PrepPlan {
  summary: string;
  focusAreas: string[];
  studyPlan: ScheduleItem[];
  practice: string[];
  talkingPoints: string[];
  questionsToAsk: string[];
  source: "openai" | "stub";
}

export interface PrepInput {
  type: InterviewType;
  company: string;
  role: string;
  date?: string | null;
  jobDescription?: string | null;
  resumeText?: string | null;
}

/** Offline, type-specific fallback so prep plans are demoable without a key. */
function stubPlan(input: PrepInput): PrepPlan {
  const label = INTERVIEW_TYPE_LABELS[input.type];
  const base: PrepPlan = {
    summary: `Offline plan for a ${label} at ${input.company || "the company"} for the ${input.role || "role"}. Add an OpenAI key in Settings for a tailored plan.`,
    focusAreas: [],
    studyPlan: [
      { when: "3+ days before", focus: "Review fundamentals and the job description." },
      { when: "1-2 days before", focus: "Targeted practice and mock run-throughs." },
      { when: "Day of", focus: "Light review, rest, and logistics check." },
    ],
    practice: [],
    talkingPoints: [],
    questionsToAsk: [
      "What does success look like for an intern in the first 90 days?",
      "What does the team's tech stack and workflow look like?",
    ],
    source: "stub",
  };

  switch (input.type) {
    case "oa":
      base.focusAreas = ["Arrays & strings", "Hash maps", "Two pointers", "Sliding window", "Recursion/DFS/BFS", "Sorting"];
      base.practice = ["10-15 easy/medium problems on the focus patterns", "1-2 timed mock assessments"];
      break;
    case "technical":
      base.focusAreas = ["Data structures & algorithms", "Time/space complexity", "Your own projects (deep dive)", "Basic system design"];
      base.practice = ["Medium LeetCode problems", "Explain a past project end-to-end out loud"];
      base.talkingPoints = ["Walk through your most technical project", "A bug you debugged and how"];
      break;
    case "behavioral":
      base.focusAreas = ["STAR stories", "Teamwork & conflict", "Leadership/initiative", "Company values"];
      base.practice = ["Write 5-6 STAR stories", "Research the company's mission and recent news"];
      base.talkingPoints = ["Resume highlights mapped to the role", "Why this company"];
      break;
    case "final":
      base.focusAreas = ["Role alignment", "Leadership & teamwork stories", "Company research", "Negotiation basics"];
      base.practice = ["Prepare a concise self-summary", "Review compensation/benefits questions"];
      base.talkingPoints = ["Why you're a strong fit", "Long-term interest in the company"];
      break;
  }
  return base;
}

const SYSTEM_PROMPT =
  "You are an interview preparation coach for software engineering internship candidates. " +
  "Generate a concrete, specific preparation plan grounded in the company, role, interview type, " +
  "timeline, job description, and the candidate's resume. Avoid vague advice. " +
  "Respond ONLY with JSON matching the requested schema.";

function buildPrompt(input: PrepInput): string {
  return `INTERVIEW TYPE: ${INTERVIEW_TYPE_LABELS[input.type]}
COMPANY: ${input.company || "(unknown)"}
ROLE: ${input.role || "(unknown)"}
DATE: ${input.date || "(not set)"}

JOB DESCRIPTION:
${input.jobDescription || "(none provided)"}

RESUME:
${input.resumeText || "(none provided)"}

Return JSON with this exact shape:
{
  "summary": string,
  "focusAreas": string[],
  "studyPlan": [{ "when": string, "focus": string }],
  "practice": string[],
  "talkingPoints": string[],
  "questionsToAsk": string[]
}`;
}

async function openaiPlan(input: PrepInput): Promise<PrepPlan> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
    summary: parsed.summary ?? "",
    focusAreas: parsed.focusAreas ?? [],
    studyPlan: parsed.studyPlan ?? [],
    practice: parsed.practice ?? [],
    talkingPoints: parsed.talkingPoints ?? [],
    questionsToAsk: parsed.questionsToAsk ?? [],
    source: "openai",
  };
}

export async function generatePrepPlan(input: PrepInput): Promise<PrepPlan> {
  if (!hasApiKey()) return stubPlan(input);
  return openaiPlan(input);
}
