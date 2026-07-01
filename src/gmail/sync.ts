import { createEmail, getExistingGmailIds, setEmailClassification } from "../db/emails";
import { classifyEmail } from "../ai/email";
import { getMessage, getProfileEmail, listJobMessageIds } from "./api";
import { getTokens, saveTokens } from "./config";

export interface SyncResult {
  added: number;
  classified: number;
}

function normalizeDate(raw: string): string | null {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Fetch job-related Gmail messages, store new ones, and classify them.
 * De-duplicates against previously-imported messages by Gmail id.
 */
export async function syncGmail(): Promise<SyncResult> {
  // Persist the connected account email for display (non-fatal on failure).
  try {
    const email = await getProfileEmail();
    const tokens = getTokens();
    if (tokens && email && tokens.email !== email) saveTokens({ ...tokens, email });
  } catch {
    /* ignore */
  }

  const ids = await listJobMessageIds(25);
  const existing = new Set(await getExistingGmailIds());
  let added = 0;
  let classified = 0;

  for (const id of ids) {
    if (existing.has(id)) continue;
    const msg = await getMessage(id);
    const emailId = await createEmail({
      sender: msg.from,
      subject: msg.subject,
      body: msg.snippet,
      received_at: normalizeDate(msg.date),
      gmail_id: id,
    });
    added++;

    if (emailId) {
      try {
        const result = await classifyEmail({ sender: msg.from, subject: msg.subject, body: msg.snippet });
        await setEmailClassification(emailId, result.category, result.confidence);
        classified++;
      } catch {
        /* classification failure is non-fatal; the email is still stored */
      }
    }
  }

  return { added, classified };
}
