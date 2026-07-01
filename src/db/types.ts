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
