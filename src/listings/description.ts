import { httpFetch } from "../lib/http";

/** Decode common HTML entities and strip tags into readable, line-broken text. */
function toText(input: string): string {
  let s = input;
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;|&apos;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s
    .split("\n")
    .map((l) => l.trim())
    .map((l) => (/^[•\s]+$/.test(l) ? "" : l)) // drop bullet-only / empty lines
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when extracted text is a careers-page template/listing, not a real JD. */
function looksLikeJunk(text: string): boolean {
  if (/%LABEL_|%BUTTON_|%DROPDOWN_|%HEADER_|%DOC_/.test(text)) return true;
  if ((text.match(/%[A-Z0-9_]+%/g) || []).length >= 3) return true; // template placeholders
  if ((text.match(/\bapply\b/gi) || []).length >= 8) return true; // job-list page
  return false;
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await httpFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html,application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort job description for a posting URL. Uses the Greenhouse/Lever JSON
 * APIs when the URL matches (clean text), otherwise extracts text from the page
 * HTML. Throws if nothing usable is found (e.g. JS-only pages like Workday).
 */
export async function fetchJobDescription(url: string): Promise<string> {
  // Greenhouse
  if (/greenhouse\.io/i.test(url)) {
    const m = url.match(/(?:for=([\w-]+)[^]*?token=(\d+))|([\w-]+)\/jobs\/(\d+)/i);
    const board = m?.[1] ?? m?.[3];
    const id = m?.[2] ?? m?.[4];
    if (board && id) {
      try {
        const res = await httpFetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?content=true`);
        if (res.ok) {
          const data = await res.json();
          if (data?.content) return toText(String(data.content));
        }
      } catch {
        /* fall through to generic */
      }
    }
  }

  // Lever
  const lever = url.match(/jobs\.lever\.co\/([\w-]+)\/([\w-]+)/i);
  if (lever) {
    try {
      const res = await httpFetch(`https://api.lever.co/v0/postings/${lever[1]}/${lever[2]}`);
      if (res.ok) {
        const d = await res.json();
        const parts: string[] = [];
        if (d.descriptionPlain) parts.push(String(d.descriptionPlain));
        else if (d.description) parts.push(toText(String(d.description)));
        for (const l of d.lists ?? []) {
          if (l.text) parts.push(l.text.replace(/<[^>]+>/g, ""));
          if (l.content) parts.push(toText(String(l.content)));
        }
        const txt = parts.join("\n\n").trim();
        if (txt.length > 60) return txt;
      }
    } catch {
      /* fall through to generic */
    }
  }

  // SmartRecruiters
  const sr = url.match(/smartrecruiters\.com\/([\w-]+)\/(\d+)/i);
  if (sr) {
    try {
      const res = await httpFetch(`https://api.smartrecruiters.com/v1/companies/${sr[1]}/postings/${sr[2]}`);
      if (res.ok) {
        const d = await res.json();
        const sections = d?.jobAd?.sections ?? {};
        const parts: string[] = [];
        for (const key of ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]) {
          const t = sections[key]?.text;
          if (t) parts.push(toText(String(t)));
        }
        const txt = parts.join("\n\n").trim();
        if (txt.length > 120) return txt;
      }
    } catch {
      /* fall through */
    }
  }

  // Generic HTML → text (best effort; reject careers-page templates / listings)
  const html = await fetchText(url);
  const txt = toText(html);
  if (txt.length < 220 || looksLikeJunk(txt)) {
    throw new Error("This posting doesn't expose its description to us — open it on the company site to read the details.");
  }
  return txt.slice(0, 8000);
}
