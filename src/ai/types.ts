export interface BulletSuggestion {
  before: string;
  after: string;
}

export interface ResumeMatchResult {
  matchScore: number; // 0-100
  matchingSkills: string[];
  missingSkills: string[];
  weakBullets: string[];
  suggestedBullets: BulletSuggestion[];
  strategy: string;
  /** Whether this came from the real model or the offline stub. */
  source: "openai" | "stub";
}

export interface ResumeMatchInput {
  resumeText: string;
  jobDescription: string;
  targetRole?: string;
}
