import { httpFetch } from "../lib/http";
import { getValidAccessToken } from "./oauth";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Narrow query so we only ever read job-related mail (privacy by design). */
const JOB_QUERY =
  'newer_than:30d (interview OR "online assessment" OR "coding challenge" OR ' +
  '"thank you for applying" OR unfortunately OR offer OR "next round" OR recruiter)';

interface GmailHeader {
  name: string;
  value: string;
}

async function authedGet<T>(path: string): Promise<T> {
  const token = await getValidAccessToken();
  const res = await httpFetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function getProfileEmail(): Promise<string> {
  const data = await authedGet<{ emailAddress: string }>("/profile");
  return data.emailAddress;
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export async function listJobMessageIds(max = 25): Promise<string[]> {
  const data = await authedGet<{ messages?: { id: string }[] }>(
    `/messages?maxResults=${max}&q=${encodeURIComponent(JOB_QUERY)}`,
  );
  return (data.messages ?? []).map((m) => m.id);
}

export async function getMessage(id: string): Promise<GmailMessage> {
  const data = await authedGet<{ snippet?: string; payload?: { headers?: GmailHeader[] } }>(
    `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
  );
  const headers = data.payload?.headers ?? [];
  const h = (name: string) =>
    headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  return { id, from: h("From"), subject: h("Subject"), date: h("Date"), snippet: data.snippet ?? "" };
}
