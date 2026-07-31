export interface Listing {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  sponsorship?: string;
  datePosted?: number; // unix seconds (when the role was posted)
  firstSeen?: number; // unix seconds (when a source first saw it)
  season?: string;
  seasonInferred?: boolean; // true = the source guessed the season, not stated
  salary?: string | null;
  remote?: boolean;
  skills?: string[]; // source-extracted skills, when available
  source: string; // originating feed / ATS
}

export interface RankedListing extends Listing {
  /** Normalized 0-100 profile match. */
  score: number;
  isNew: boolean;
  /** True when the listing's title matches one of the user's target roles. */
  matchesRoles: boolean;
  /** False when the listing's sponsorship stance conflicts with the user's work auth. */
  sponsorshipOk: boolean;
}
