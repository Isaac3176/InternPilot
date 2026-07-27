export interface Listing {
  id: string;
  company: string;
  title: string;
  url: string;
  locations: string[];
  sponsorship?: string;
  datePosted?: number; // unix seconds
  season?: string;
}

export interface RankedListing extends Listing {
  score: number;
  isNew: boolean;
  /** False when the listing's sponsorship stance conflicts with the user's work auth. */
  sponsorshipOk: boolean;
}
