/**
 * Cold Email generator (résumé prompt #5): a short, confident outreach note to a
 * hiring manager / recruiter, grounded in the student's résumé and referencing
 * one specific thing about the company (from the JD). OpenAI when a key is set;
 * an offline template otherwise. Always shown for review before sending.
 */
import { getProfile } from "../db/profile";
import { getApiKey, getModel, hasApiKey } from "./settings";
import { httpFetch } from "../lib/http";

export interface ColdEmailInput {
  company: string;
  role: string;
  jd?: string;
  resume?: string;
  contactName?: string;
}
export interface ColdEmailResult {
  text: string;
  source: "openai" | "stub";
}

export async function coldEmail(input: ColdEmailInput): Promise<ColdEmailResult> {
  const profile = await getProfile();
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  const major = profile?.major ?? "";
  const school = profile?.school ?? "";

  if (!hasApiKey()) {
    const greeting = input.contactName ? `Hi ${input.contactName.split(" ")[0]},` : "Hi there,";
    const who = `I'm ${name || "a student"}${major ? `, a ${major} student` : ""}${school ? ` at ${school}` : ""}`;
    const text = `${greeting}

${who}, and I'm really interested in the ${input.role} role at ${input.company}. I've built real projects end to end and would bring that hands-on drive to your team. I admire what ${input.company} is doing and would love a quick chat — or a pointer to the right person.

Thanks,
${name}`;
    return { text, source: "stub" };
  }

  const res = await httpFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Write a 4-line cold outreach message (LinkedIn or email) from a student to a hiring manager/recruiter for an internship. Tone: confident, not desperate. Reference ONE specific thing about the company drawn from the job description (don't fabricate facts). Ground the student's one-line pitch in their résumé. End with a light ask (a quick chat, or a pointer to the right person). Keep it to ~4 short lines. Respond ONLY with JSON: { \"message\": string }.",
        },
        {
          role: "user",
          content: `COMPANY: ${input.company}
ROLE: ${input.role}
CONTACT: ${input.contactName ?? "(unknown — address generically)"}
STUDENT: ${name || "(n/a)"}${major ? `, ${major}` : ""}${school ? `, ${school}` : ""}
RÉSUMÉ:\n${(input.resume ?? "").slice(0, 3000) || "(not provided)"}
JOB DESCRIPTION:\n${(input.jd ?? "").slice(0, 3000) || "(not provided)"}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  return { text: (parsed.message ?? "").trim(), source: "openai" };
}
