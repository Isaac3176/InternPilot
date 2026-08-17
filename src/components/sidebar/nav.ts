// nav.ts — the single source of truth for the sidebar.
// Adding a destination means adding it here, not editing JSX.
import type { ComponentType, SVGProps } from "react";
import { HomeIcon, SearchIcon, ListIcon, DocIcon, ChatIcon } from "./icons";

export type BadgeKey =
  | "newToday"
  | "savedJobs"
  | "queued"
  | "needsAction"   // RED, deadline-driven
  | "replies"
  | "flaggedBullets";

export interface NavChild { label: string; to: string; end?: boolean; badge?: BadgeKey }
export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: BadgeKey;       // grey pill on the parent
  alertBadge?: BadgeKey;  // red pill — reserve for deadlines
  children?: NavChild[];
}

/**
 * Five destinations. Every former sidebar row is now a child here, a segment
 * inside a page, or an action on an object — but all wired to InternPilot's
 * existing routes so nothing is lost:
 *
 *   Home            -> Dashboard (/dashboard)
 *   Fast Apply      -> Jobs / Apply queue (/)
 *   Release Radar   -> Jobs / New today (/radar)
 *   Watchlist       -> Jobs / Saved (/watchlist)
 *   Email Inbox     -> Tracker / Replies (/emails)
 *   Résumé Lab      -> Toolkit / Résumé Lab (/resume-lab)
 *   Bullet Library  -> Toolkit / Bullets (/bullets)
 *   Experiences     -> Toolkit / Experiences (/experiences)
 *   Answer Vault    -> Toolkit / Saved answers (/answers)
 *   Interview Prep  -> Coach / Interview prep (/prep)
 *   Networking      -> Coach / Networking (/networking)
 *   Apply Assist    -> action on a role (/apply), reached from a job — not a nav row
 *   Profile/Settings-> account menu at the foot
 */
export const NAV: NavItem[] = [
  { id: "home", label: "Home", to: "/dashboard", icon: HomeIcon },
  {
    id: "jobs", label: "Jobs", to: "/internships", icon: SearchIcon, badge: "newToday",
    children: [
      { label: "Browse", to: "/internships", end: true },
      { label: "Saved", to: "/watchlist", badge: "savedJobs" },
      { label: "Apply queue", to: "/", end: true, badge: "queued" },
      { label: "New today", to: "/radar", badge: "newToday" },
    ],
  },
  {
    id: "tracker", label: "Tracker", to: "/applications", icon: ListIcon, alertBadge: "needsAction",
    children: [
      { label: "Active", to: "/applications", end: true },
      { label: "Diagnostics", to: "/diagnostics" },
      { label: "Replies", to: "/emails", badge: "replies" },
    ],
  },
  {
    id: "toolkit", label: "Toolkit", to: "/toolkit", icon: DocIcon,
    children: [
      { label: "Résumés", to: "/toolkit", end: true },
      { label: "Bullets", to: "/toolkit/bullets", badge: "flaggedBullets" },
      { label: "Experiences", to: "/toolkit/experiences" },
      { label: "Saved answers", to: "/toolkit/answers" },
    ],
  },
  {
    id: "coach", label: "Coach", to: "/chat", icon: ChatIcon,
    children: [
      { label: "Ask", to: "/chat", end: true },
      { label: "Prep", to: "/prep-engine" },
      { label: "Interview prep", to: "/prep" },
      { label: "OA Lab", to: "/oa" },
      { label: "Networking", to: "/networking" },
    ],
  },
];

/** Counts the sidebar can display. Feed this from your metrics layer. */
export type NavCounts = Partial<Record<BadgeKey, number>>;
