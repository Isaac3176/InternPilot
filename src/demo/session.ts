import { e2eKey, setE2eRuntimeMode } from "../lib/e2e";
import type { ApplicationRow, InterviewRow, Profile, ResumeVersion } from "../db/types";

const DEMO_SESSION_KEY = "internpilot.demo";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function dateDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(e2eKey(key), JSON.stringify(value));
}

function clearDemoData(): void {
  const prefix = e2eKey("");
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) localStorage.removeItem(key);
  }
}

export function isDemoSession(): boolean {
  try { return localStorage.getItem(DEMO_SESSION_KEY) === "1"; } catch { return false; }
}

export function startDemoSession(): void {
  clearDemoData();
  localStorage.setItem(DEMO_SESSION_KEY, "1");
  setE2eRuntimeMode(true);

  const now = new Date().toISOString();
  const resumes: ResumeVersion[] = [
    {
      id: 1,
      name: "AI/ML Resume",
      target_role: "Machine Learning / AI Intern",
      file_path: null,
      created_at: isoDaysAgo(4),
      content: "Projects: ML ranking model, React dashboard, Python data pipelines, TypeScript tools.",
    },
    {
      id: 2,
      name: "General SWE Resume",
      target_role: "Software Engineering Intern",
      file_path: null,
      created_at: isoDaysAgo(8),
      content: "Projects: Full-stack internship tracker, REST APIs, React, TypeScript, PostgreSQL.",
    },
  ];
  const profile: Profile = {
    id: 1,
    first_name: "Demo",
    last_name: "Student",
    email: "demo@internpilotapp.live",
    phone: "555-0100",
    current_city: "New York",
    current_state: "NY",
    current_country: "United States",
    linkedin_url: "https://linkedin.com/in/demo-student",
    github_url: "https://github.com/demo-student",
    portfolio_url: "https://demo-student.dev",
    school: "Example University",
    degree: "Bachelor's",
    major: "Computer Science",
    minor: "Data Science",
    gpa: "3.8",
    graduation_date: "May 2027",
    grad_year: "2027",
    target_roles: "Software Engineering Intern, Machine Learning Intern, AI Intern",
    locations: "Remote in USA, New York City, San Francisco Bay Area, Seattle",
    skills: "TypeScript, React, Python, Machine Learning, SQL, REST",
    remote_pref: "any",
    preferred_resume_id: 1,
    desired_salary: "",
    willing_to_relocate: "Yes",
    earliest_start_date: "May 2027",
    target_date: "Within 6 months",
    work_auth: "f1_cpt",
    authorized_us: "Yes",
    requires_sponsorship: "No",
    security_clearance: "No",
    gender: null,
    race_ethnicity: null,
    hispanic_latino: null,
    veteran_status: null,
    disability_status: null,
    onboarded: 1,
    updated_at: now,
  };
  const applications: ApplicationRow[] = [
    {
      id: 1,
      company_id: 1,
      company_name: "Garmin",
      role_title: "Software Engineer Intern",
      job_link: "https://example.test/jobs/garmin-swe",
      location: "Austin, TX",
      status: "applied",
      date_saved: isoDaysAgo(12),
      date_applied: dateDaysFromNow(-12),
      resume_version_id: 2,
      resume_version_name: "General SWE Resume",
      job_description: "Build TypeScript and API features for connected devices.",
      notes: "Demo application: follow up this week.",
      referral: null,
      created_at: isoDaysAgo(12),
      discovered_at: isoDaysAgo(13),
      applied_at: isoDaysAgo(12),
      posting_posted_at: isoDaysAgo(15),
      match_score: 82,
      eligibility: "Likely eligible",
      source: "DemoFeed",
      company_priority: "target",
      furthest_stage: "applied",
      result_date: null,
    },
    {
      id: 2,
      company_id: 2,
      company_name: "DeepMind",
      role_title: "Machine Learning Engineer Intern",
      job_link: "https://example.test/jobs/deepmind-ml",
      location: "Remote in USA",
      status: "oa",
      date_saved: isoDaysAgo(6),
      date_applied: dateDaysFromNow(-5),
      resume_version_id: 1,
      resume_version_name: "AI/ML Resume",
      job_description: "Prototype ML evaluation tooling with Python.",
      notes: "Demo application: OA received.",
      referral: "Alumni intro",
      created_at: isoDaysAgo(6),
      discovered_at: isoDaysAgo(7),
      applied_at: isoDaysAgo(5),
      posting_posted_at: isoDaysAgo(9),
      match_score: 91,
      eligibility: "Likely eligible",
      source: "DemoFeed",
      company_priority: "dream",
      furthest_stage: "oa",
      result_date: null,
    },
    {
      id: 3,
      company_id: 3,
      company_name: "Stripe",
      role_title: "AI Platform Intern",
      job_link: "https://example.test/jobs/stripe-ai-platform",
      location: "Seattle, WA",
      status: "interview",
      date_saved: isoDaysAgo(18),
      date_applied: dateDaysFromNow(-16),
      resume_version_id: 1,
      resume_version_name: "AI/ML Resume",
      job_description: "Work on model-serving infrastructure and product analytics.",
      notes: "Demo application: technical screen scheduled.",
      referral: "Friend referral",
      created_at: isoDaysAgo(18),
      discovered_at: isoDaysAgo(19),
      applied_at: isoDaysAgo(16),
      posting_posted_at: isoDaysAgo(20),
      match_score: 88,
      eligibility: "Likely eligible",
      source: "DemoFeed",
      company_priority: "target",
      furthest_stage: "interview",
      result_date: null,
    },
  ];
  const interviews: InterviewRow[] = [
    {
      id: 1,
      application_id: 3,
      type: "technical",
      date: dateDaysFromNow(3),
      prep_status: "in_progress",
      prep_plan: null,
      notes: "Review ML systems and React project walkthrough.",
      created_at: isoDaysAgo(2),
      company_name: "Stripe",
      role_title: "AI Platform Intern",
      job_description: "Work on model-serving infrastructure and product analytics.",
      resume_version_id: 1,
    },
  ];

  localStorage.setItem(e2eKey("session"), "1");
  write("profile", profile);
  write("resumes", resumes);
  write("resume.nextId", 3);
  write("applications", applications);
  write("application.nextId", 4);
  write("interviews", interviews);
}

export function endDemoSession(): void {
  localStorage.removeItem(DEMO_SESSION_KEY);
  clearDemoData();
  setE2eRuntimeMode(false);
}
