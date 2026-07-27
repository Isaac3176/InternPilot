/** Application pipeline statuses, in funnel order. */
export const STATUSES = [
  "interested",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  interested: "Interested",
  applied: "Applied",
  oa: "Online Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export interface Company {
  id: number;
  name: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  notes: string | null;
  created_at: string;
}

export interface ResumeVersion {
  id: number;
  name: string;
  file_path: string | null;
  content: string | null;
  target_role: string | null;
  created_at: string;
}

export interface Application {
  id: number;
  company_id: number | null;
  role_title: string;
  job_link: string | null;
  location: string | null;
  status: Status;
  date_saved: string;
  date_applied: string | null;
  resume_version_id: number | null;
  job_description: string | null;
  notes: string | null;
  referral: string | null;
  created_at: string;
}

/** Application joined with its company name and resume version name for display. */
export interface ApplicationRow extends Application {
  company_name: string | null;
  resume_version_name: string | null;
}

export const INTERVIEW_TYPES = ["oa", "technical", "behavioral", "final"] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  oa: "Online Assessment",
  technical: "Technical Interview",
  behavioral: "Behavioral Interview",
  final: "Final Round",
};

export const PREP_STATUSES = ["not_started", "in_progress", "ready"] as const;
export type PrepStatus = (typeof PREP_STATUSES)[number];

export const PREP_STATUS_LABELS: Record<PrepStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  ready: "Ready",
};

export interface Interview {
  id: number;
  application_id: number | null;
  type: InterviewType;
  date: string | null;
  prep_status: PrepStatus;
  notes: string | null;
  prep_plan: string | null;
  created_at: string;
}

/** Interview joined with company + role for display. */
export interface InterviewRow extends Interview {
  company_name: string | null;
  role_title: string | null;
  job_description: string | null;
  resume_version_id: number | null;
}

export const WORK_AUTH_OPTIONS = [
  "us_citizen",
  "permanent_resident",
  "f1_opt",
  "f1_cpt",
  "h1b",
  "tn",
  "need_sponsorship",
  "other",
] as const;
export type WorkAuth = (typeof WORK_AUTH_OPTIONS)[number];

export const WORK_AUTH_LABELS: Record<WorkAuth, string> = {
  us_citizen: "U.S. Citizen",
  permanent_resident: "Permanent Resident (Green Card)",
  f1_opt: "F-1 / OPT",
  f1_cpt: "F-1 / CPT",
  h1b: "H-1B",
  tn: "TN",
  need_sponsorship: "Require sponsorship",
  other: "Other",
};

export const REMOTE_PREFS = ["any", "remote", "hybrid", "onsite"] as const;
export type RemotePref = (typeof REMOTE_PREFS)[number];

export const REMOTE_PREF_LABELS: Record<RemotePref, string> = {
  any: "Any",
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

// ---- Simplify-style questionnaire option lists (human-readable for autofill) ----
export const YES_NO = ["Yes", "No"];
export const DEGREE_OPTIONS = ["High School", "Associate's", "Bachelor's", "Master's", "PhD", "Other"];
export const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];
export const RACE_OPTIONS = [
  "American Indian or Alaska Native",
  "Asian",
  "Black or African American",
  "Hispanic or Latino",
  "Native Hawaiian or Other Pacific Islander",
  "White",
  "Two or More Races",
  "Prefer not to say",
];
export const HISPANIC_OPTIONS = ["Yes", "No", "Prefer not to say"];
export const VETERAN_OPTIONS = [
  "I am not a protected veteran",
  "I am a protected veteran",
  "Prefer not to say",
];
export const DISABILITY_OPTIONS = ["Yes", "No", "Prefer not to say"];

export interface Profile {
  id: number;
  // Personal
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  current_city: string | null;
  current_state: string | null;
  current_country: string | null;
  // Links
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  // Education
  school: string | null;
  degree: string | null;
  major: string | null;
  minor: string | null;
  gpa: string | null;
  graduation_date: string | null;
  grad_year: string | null;
  // Job preferences
  target_roles: string | null;
  locations: string | null;
  skills: string | null;
  remote_pref: RemotePref | null;
  preferred_resume_id: number | null;
  desired_salary: string | null;
  willing_to_relocate: string | null;
  earliest_start_date: string | null;
  // Work authorization
  work_auth: WorkAuth | null;
  authorized_us: string | null;
  requires_sponsorship: string | null;
  security_clearance: string | null;
  // Demographics (EEO, optional)
  gender: string | null;
  race_ethnicity: string | null;
  hispanic_latino: string | null;
  veteran_status: string | null;
  disability_status: string | null;
  // Meta
  onboarded: number;
  updated_at: string;
}

export const RELATIONSHIP_TYPES = [
  "friend",
  "alumnus",
  "professor_connection",
  "previous_coworker",
  "cold_outreach",
  "other",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  friend: "Friend",
  alumnus: "Alumnus",
  professor_connection: "Professor connection",
  previous_coworker: "Previous coworker",
  cold_outreach: "Cold outreach",
  other: "Other",
};

/** Referral pipeline, in progression order. */
export const REFERRAL_STATUSES = [
  "no_referral_path",
  "potential_contact",
  "outreach_planned",
  "outreach_sent",
  "follow_up_due",
  "contact_responded",
  "referral_agreed",
  "referral_submitted",
  "referral_confirmed",
  "applied_through_referral",
  "declined",
  "no_response",
  "expired",
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  no_referral_path: "No referral path",
  potential_contact: "Potential contact found",
  outreach_planned: "Outreach planned",
  outreach_sent: "Outreach sent",
  follow_up_due: "Follow-up due",
  contact_responded: "Contact responded",
  referral_agreed: "Referral agreed",
  referral_submitted: "Referral submitted",
  referral_confirmed: "Referral confirmed",
  applied_through_referral: "Applied through referral",
  declined: "Declined",
  no_response: "No response",
  expired: "Expired",
};

export interface Contact {
  id: number;
  name: string;
  company_id: number | null;
  title: string | null;
  team: string | null;
  email: string | null;
  linkedin: string | null;
  relationship_type: RelationshipType | null;
  relationship_strength: number | null;
  how_you_know: string | null;
  contact_again: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRow extends Contact {
  company_name: string | null;
}

export interface Referral {
  id: number;
  contact_id: number | null;
  application_id: number | null;
  company_id: number | null;
  status: ReferralStatus;
  first_contacted: string | null;
  last_interaction: string | null;
  next_follow_up: string | null;
  confirmation_note: string | null;
  referral_link: string | null;
  thank_you_sent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralRow extends Referral {
  contact_name: string | null;
  company_name: string | null;
  role_title: string | null;
}

export const EMAIL_CATEGORIES = [
  "confirmation",
  "rejection",
  "oa",
  "interview",
  "recruiter",
  "offer",
  "other",
] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  confirmation: "Application Confirmation",
  rejection: "Rejection",
  oa: "Online Assessment",
  interview: "Interview",
  recruiter: "Recruiter Follow-up",
  offer: "Offer",
  other: "Other / Update",
};

/** Application status a given email category suggests (null = no change). */
export const CATEGORY_TO_STATUS: Record<EmailCategory, Status | null> = {
  confirmation: "applied",
  rejection: "rejected",
  oa: "oa",
  interview: "interview",
  recruiter: null,
  offer: "offer",
  other: null,
};

export interface Email {
  id: number;
  sender: string | null;
  subject: string | null;
  body: string | null;
  received_at: string | null;
  classification: EmailCategory | null;
  confidence: number | null;
  application_id: number | null;
  gmail_id: string | null;
  created_at: string;
}

/** Email joined with its linked application's company + role for display. */
export interface EmailRow extends Email {
  company_name: string | null;
  role_title: string | null;
}

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export interface InterviewExperience {
  id: number;
  company_id: number | null;
  source: string | null;
  role: string | null;
  summary: string | null;
  topics: string | null;
  difficulty: Difficulty | null;
  created_at: string;
}

/** Interview experience joined with its company name for display. */
export interface ExperienceRow extends InterviewExperience {
  company_name: string | null;
}

export interface ResumeBullet {
  id: number;
  experience_name: string | null;
  original_text: string | null;
  improved_text: string | null;
  tags: string | null;
  application_id: number | null;
  created_at: string;
}
