import type { Profile } from "../db/types";
import type { RankingPrefs } from "../ranking/prefs";
import { matchesLocationPreferences, splitLocationFilters } from "./location";
import { listingEmploymentType, matchesSeniority, matchesTargetRoles } from "./service";
import type { Listing } from "./types";
import { isUndergradDegree, matchesSeason, requiresGradDegree } from "./relevance";

function splitCsv(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchesEmploymentPrefs(listing: Listing, prefs: RankingPrefs): boolean {
  if (!prefs.employmentTypes.length) return true;
  const type = listingEmploymentType(listing.title);
  if (type === "unknown") return true;
  return prefs.employmentTypes.includes(type);
}

export interface FeedDiagnosticStep {
  key: string;
  label: string;
  count: number;
  removed: number;
}

export interface FeedDiagnostics {
  raw: number;
  steps: FeedDiagnosticStep[];
  filters: {
    employmentTypes: string[];
    roles: string[];
    locations: string[];
    targetSeason: string;
    undergrad: boolean;
  };
}

export function buildFeedDiagnostics(
  listings: Listing[],
  profile: Profile | null,
  prefs: RankingPrefs,
): FeedDiagnostics {
  const profileRoles = splitCsv(profile?.target_roles);
  const roles = profileRoles.length ? profileRoles : prefs.targetRoles.map((r) => r.toLowerCase());
  const locations = splitLocationFilters(profile?.locations || profile?.current_country).map((s) => s.toLowerCase());
  const undergrad = isUndergradDegree(profile?.degree);

  let current = listings.slice();
  const steps: FeedDiagnosticStep[] = [];
  const addStep = (key: string, label: string, next: Listing[]) => {
    steps.push({ key, label, count: next.length, removed: current.length - next.length });
    current = next;
  };

  addStep(
    "employment",
    "After job type",
    current.filter((listing) => matchesEmploymentPrefs(listing, prefs)),
  );
  addStep(
    "seniority",
    "After seniority",
    current.filter((listing) => matchesSeniority(listing.title, prefs.employmentTypes, prefs.targetRoles)),
  );
  addStep(
    "roles",
    "After target role",
    current.filter((listing) => roles.length === 0 || matchesTargetRoles(listing.title, roles)),
  );
  addStep(
    "locations",
    "After location",
    current.filter((listing) => matchesLocationPreferences(locations, listing.locations, listing.remote)),
  );
  addStep(
    "season",
    "After season",
    current.filter((listing) =>
      matchesSeason(listing.title, prefs.targetSeason) &&
      (!listing.season || listing.seasonInferred || matchesSeason(listing.season, prefs.targetSeason)),
    ),
  );
  addStep(
    "degree",
    "After degree level",
    current.filter((listing) => !(undergrad && requiresGradDegree(listing.title))),
  );

  return {
    raw: listings.length,
    steps,
    filters: {
      employmentTypes: prefs.employmentTypes,
      roles,
      locations,
      targetSeason: prefs.targetSeason,
      undergrad,
    },
  };
}
