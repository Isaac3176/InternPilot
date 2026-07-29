import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getProfile } from "../db/profile";
import { createApplication } from "../db/applications";
import { notify } from "../lib/notify";

const TOKEN_KEY = "internpilot.bridge.token";
export const BRIDGE_PORT = 8765;

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
    workAuthorization: s(p.work_auth),
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

let listening = false;

/** Listen for jobs the extension records, and insert them as applications. */
export async function startBridgeListener(onRecorded?: () => void): Promise<void> {
  if (listening) return;
  listening = true;
  await listen<Record<string, string>>("bridge://application", async (event) => {
    const p = event.payload ?? {};
    try {
      await createApplication({
        company_name: p.company ?? "",
        role_title: p.title || p.role || "Application",
        job_link: p.url || null,
        location: p.location || null,
        status: "applied",
        date_applied: new Date().toISOString().slice(0, 10),
      });
      notify("Application recorded", `${p.company || "A company"} — ${p.title || "role"} added from the extension.`);
      onRecorded?.();
    } catch (e) {
      console.error("record application failed", e);
    }
  });
}
