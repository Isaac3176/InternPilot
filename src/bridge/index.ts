import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getProfile } from "../db/profile";
import { createApplication, listApplications, setApplicationStatus } from "../db/applications";
import { getResumeVersion } from "../db/resumes";
import { createEmail, setEmailClassification } from "../db/emails";
import { classifyEmail } from "../ai/email";
import { getReusableAnswers } from "../apply/answers";
import { CATEGORY_TO_STATUS, STATUS_LABELS, WORK_AUTH_LABELS, type WorkAuth } from "../db/types";
import { notify } from "../lib/notify";

const TOKEN_KEY = "internpilot.bridge.token";
export const BRIDGE_PORT = 8765;

/** Fired on window after the extension records a job, so open pages can refresh. */
export const APP_RECORDED_EVENT = "internpilot:application-recorded";

/** Stable per-device token the extension must send to read/write the bridge. */
export function getBridgeToken(): string {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    t = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

/** Flat autofill map the extension maps onto form fields. */
async function buildAutofill(): Promise<Record<string, string>> {
  const p = await getProfile();
  if (!p) return {};
  const s = (v: string | null | undefined) => v ?? "";
  return {
    firstName: s(p.first_name),
    lastName: s(p.last_name),
    fullName: [p.first_name, p.last_name].filter(Boolean).join(" "),
    email: s(p.email),
    phone: s(p.phone),
    city: s(p.current_city),
    state: s(p.current_state),
    country: s(p.current_country),
    linkedin: s(p.linkedin_url),
    github: s(p.github_url),
    portfolio: s(p.portfolio_url),
    website: s(p.portfolio_url),
    school: s(p.school),
    degree: s(p.degree),
    major: s(p.major),
    minor: s(p.minor),
    gpa: s(p.gpa),
    graduationDate: s(p.graduation_date),
    gradYear: s(p.grad_year),
    workAuthorization: p.work_auth ? WORK_AUTH_LABELS[p.work_auth as WorkAuth] : "",
    authorizedToWork: s(p.authorized_us),
    requiresSponsorship: s(p.requires_sponsorship),
    gender: s(p.gender),
    race: s(p.race_ethnicity),
    hispanicLatino: s(p.hispanic_latino),
    veteranStatus: s(p.veteran_status),
    disabilityStatus: s(p.disability_status),
    desiredSalary: s(p.desired_salary),
    willingToRelocate: s(p.willing_to_relocate),
    startDate: s(p.earliest_start_date),
    // Display-only (not used for form fills): shown in the extension popup.
    resumeName: p.preferred_resume_id ? (await getResumeVersion(p.preferred_resume_id))?.name ?? "" : "",
  };
}

/** Push the current profile + token to the local bridge so the extension can read it. */
export async function pushProfileToBridge(): Promise<void> {
  try {
    const data = await buildAutofill();
    await invoke("bridge_set_profile", { token: getBridgeToken(), profile: JSON.stringify(data) });
  } catch (e) {
    console.error("bridge push failed", e);
  }
}

/** Push approved answer-vault entries so the extension can fill essay fields. */
export async function pushAnswersToBridge(): Promise<void> {
  try {
    const data = getReusableAnswers().map((a) => ({
      pattern: a.pattern, answer: a.answer, question: a.question, category: a.category,
    }));
    await invoke("bridge_set_answers", { token: getBridgeToken(), answers: JSON.stringify(data) });
  } catch (e) {
    console.error("bridge answers push failed", e);
  }
}

/**
 * Classify an email the extension read, match it to an application by company name,
 * record it, and (when confident) advance that application's status. Powers the
 * extension's "Read this email" action.
 */
async function processIncomingEmail(p: Record<string, string>): Promise<void> {
  const email = { sender: p.sender || null, subject: p.subject || null, body: p.body || null };
  if (!email.subject && !email.body) {
    notify("Couldn't read the email", "No email content was found on this page.");
    return;
  }
  const cls = await classifyEmail(email);
  const apps = await listApplications();
  const hay = `${email.sender ?? ""} ${email.subject ?? ""} ${email.body ?? ""}`.toLowerCase();
  const matched = apps.find((a) => {
    const n = (a.company_name ?? "").trim().toLowerCase();
    return n.length >= 3 && hay.includes(n);
  }) ?? null;

  const id = await createEmail({
    sender: email.sender, subject: email.subject, body: email.body,
    received_at: new Date().toISOString(), application_id: matched?.id ?? null,
  });
  if (id) await setEmailClassification(id, cls.category, cls.confidence);

  const suggested = CATEGORY_TO_STATUS[cls.category];
  if (matched && suggested && cls.confidence >= 0.5) {
    await setApplicationStatus(matched.id, suggested);
    notify(`${matched.company_name ?? "Application"} → ${STATUS_LABELS[suggested]}`, `Read a ${cls.category} email and updated the application.`);
  } else if (matched) {
    notify(`Email saved · ${matched.company_name ?? ""}`, `Classified as ${cls.category}. Open Email inbox to apply the status.`);
  } else {
    notify("Email saved", `Classified as ${cls.category} — couldn't match a company. Link it in Email inbox.`);
  }
  window.dispatchEvent(new CustomEvent(APP_RECORDED_EVENT));
}

let listening = false;

/** Listen for jobs and emails the extension sends, and record them. */
export async function startBridgeListener(onRecorded?: () => void): Promise<void> {
  if (listening) return;
  listening = true;
  await listen<Record<string, string>>("bridge://email", async (event) => {
    try { await processIncomingEmail(event.payload ?? {}); onRecorded?.(); }
    catch (e) { console.error("process email failed", e); notify("Email read failed", "Couldn't process that email."); }
  });
  await listen<Record<string, string>>("bridge://application", async (event) => {
    const p = event.payload ?? {};
    try {
      // Don't create a duplicate if this posting URL is already tracked.
      const url = p.url || null;
      if (url) {
        const existing = await listApplications();
        if (existing.some((a) => a.job_link === url)) {
          notify("Already tracked", `${p.company || "This role"} is already in your applications.`);
          window.dispatchEvent(new CustomEvent(APP_RECORDED_EVENT));
          onRecorded?.();
          return;
        }
      }
      const status = p.status === "interested" ? "interested" : "applied";
      await createApplication({
        company_name: p.company ?? "",
        role_title: p.title || p.role || "Application",
        job_link: url,
        location: p.location || null,
        status,
        date_applied: status === "applied" ? new Date().toISOString().slice(0, 10) : null,
      });
      notify("Application recorded", `${p.company || "A company"} — ${p.title || "role"} added from the extension.`);
      window.dispatchEvent(new CustomEvent(APP_RECORDED_EVENT));
      onRecorded?.();
    } catch (e) {
      console.error("record application failed", e);
    }
  });
}
