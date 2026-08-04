// Rebuild src/release/release-history.json by snapshot-sampling the SimplifyJobs
// repo's git history across past recruiting cycles. Each role carries a real
// `date_posted`, so sampling the file at several points in time recovers the
// first-post date per company / role-family / season — even for roles later
// pruned from the current file.
//
// Usage:
//   GITHUB_TOKEN=ghp_xxx node scripts/build-release-history.mjs
//
// A token is strongly recommended (unauthenticated GitHub API is 60 req/hr).
// Behind a TLS-intercepting proxy you may also need:
//   NODE_TLS_REJECT_UNAUTHORIZED=0 GITHUB_TOKEN=... node scripts/build-release-history.mjs
//
// Add more SAMPLE_DATES (roughly every ~6 weeks per cycle) for finer coverage.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = "SimplifyJobs/Summer2027-Internships";
const FILE = ".github/scripts/listings.json";
const SAMPLE_DATES = [
  "2023-11-15", "2024-01-15", "2024-04-15",
  "2025-01-15", "2025-04-15",
  "2026-01-15", "2026-04-15", "2026-08-01",
];

const token = process.env.GITHUB_TOKEN;
const gh = (url) => fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function family(cat, title) {
  const c = `${cat ?? ""} ${title}`.toLowerCase();
  if (/data|machine learning|\bml\b|\bai\b/.test(c)) return "ml-data";
  if (/hardware|firmware|embedded|electrical|asic|fpga/.test(c)) return "hardware";
  if (/quant/.test(c)) return "quant";
  if (/software|full.?stack|back.?end|front.?end|devops|\bsre\b|infrastructure|platform|security|systems|engineer|developer/.test(c)) return "software";
  return "other";
}

const agg = new Map(); // key: `${ck}|${fam}|${season}` -> { e, ids:Set, name }

for (const date of SAMPLE_DATES) {
  const cRes = await gh(`https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(FILE)}&until=${date}T00:00:00Z&per_page=1`);
  const commits = await cRes.json();
  const sha = Array.isArray(commits) && commits[0]?.sha;
  if (!sha) { console.warn(`${date}: no commit`); continue; }
  const raw = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${FILE}`);
  const rows = await raw.json();
  let kept = 0;
  for (const r of rows) {
    if (!r.date_posted || !r.company_name) continue;
    const season = (r.terms || []).find((t) => t.toLowerCase().startsWith("summer"));
    if (!season) continue;
    const fam = family(r.category, r.title);
    if (fam !== "software" && fam !== "ml-data") continue;
    const key = `${norm(r.company_name)}|${fam}|${season}`;
    const a = agg.get(key) ?? { e: r.date_posted, ids: new Set(), name: r.company_name };
    a.e = Math.min(a.e, r.date_posted);
    a.ids.add(r.id ?? `${r.title}:${r.date_posted}`);
    if (r.company_name.length < a.name.length) a.name = r.company_name;
    agg.set(key, a);
    kept++;
  }
  console.log(`${date}: sha=${sha.slice(0, 8)} rows=${rows.length} kept=${kept}`);
}

const companies = {};
for (const [key, a] of agg) {
  const [ck, fam, season] = key.split("|");
  const c = companies[ck] ?? { name: a.name, fam: {} };
  (c.fam[fam] ??= {})[season] = { e: a.e, n: a.ids.size };
  if (a.name.length < c.name.length) c.name = a.name;
  companies[ck] = c;
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: `SimplifyJobs ${REPO} git history (${SAMPLE_DATES.length} snapshots)`,
  companies,
};
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "release", "release-history.json");
writeFileSync(dest, JSON.stringify(out));
console.log(`\nWrote ${Object.keys(companies).length} companies -> ${dest}`);
