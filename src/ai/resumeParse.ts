import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

/** Profile fields a parsed resume can populate (values are strings for the form). */
export type ParsedResume = Partial<
  Record<
    | "first_name" | "last_name" | "email" | "phone"
    | "current_city" | "current_state"
    | "linkedin_url" | "github_url" | "portfolio_url"
    | "school" | "degree" | "major" | "minor" | "gpa" | "graduation_date" | "grad_year"
    | "skills",
    string
  >
>;

function first(m: RegExpMatchArray | null): string | undefined {
  return m?.[0]?.trim();
}

/** Offline extraction: reliable for contact details and links, best-effort for the rest. */
function stubParse(text: string): ParsedResume {
  const out: ParsedResume = {};
  const email = first(text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/));
  if (email) out.email = email;
  const phone = first(text.match(/\+?\d[\d\s().-]{8,}\d/));
  if (phone) out.phone = phone;
  const linkedin = first(text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i));
  if (linkedin) out.linkedin_url = linkedin;
  const github = first(text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i));
  if (github) out.github_url = github;
  const gpa = text.match(/GPA[:\s]*([0-4]\.\d{1,2})/i);
  if (gpa) out.gpa = gpa[1];
  const gradYear = text.match(/(?:expected|graduation|grad)[^\n]*?(20\d{2})/i);
  if (gradYear) out.grad_year = gradYear[1];

  // Name heuristic: first non-empty line with 2-3 capitalized words.
  const line = text.split(/\r?\n/).map((l) => l.trim()).find((l) => /^[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,2}$/.test(l));
  if (line) {
    const parts = line.split(/\s+/);
    out.first_name = parts[0];
    out.last_name = parts.slice(1).join(" ");
  }
  return out;
}

const SYSTEM_PROMPT =
  "You extract structured profile fields from a resume for autofilling job applications. " +
  "Only return values that are clearly present in the resume; omit anything you are unsure about. " +
  "Never invent data. Respond ONLY with JSON.";

function buildPrompt(text: string): string {
  return `RESUME:
${text.slice(0, 8000)}

Extract into JSON (omit keys you can't find; skills as a comma-separated string):
{
  "first_name": string, "last_name": string, "email": string, "phone": string,
  "current_city": string, "current_state": string,
  "linkedin_url": string, "github_url": string, "portfolio_url": string,
  "school": string, "degree": string, "major": string, "minor": string,
  "gpa": string, "graduation_date": string, "grad_year": string,
  "skills": string
}`;
}

async function openaiParse(text: string): Promise<ParsedResume> {
  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(text) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  // Keep only non-empty string values, merged over the offline extraction as a safety net.
  const clean: ParsedResume = { ...stubParse(text) };
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" && v.trim()) (clean as Record<string, string>)[k] = v.trim();
  }
  return clean;
}

/** Parse resume text into profile fields. Uses OpenAI when a key is set, else regex. */
export async function parseResume(text: string): Promise<ParsedResume> {
  if (!text.trim()) return {};
  if (!hasApiKey()) return stubParse(text);
  try {
    return await openaiParse(text);
  } catch {
    return stubParse(text);
  }
}
