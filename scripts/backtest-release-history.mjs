// Backtest the Release Radar forecaster against held-out cycles, so accuracy is
// measured, not assumed. For every company with >=2 cycles we predict the LATEST
// cycle's first-post date using only the earlier cycles (the same recency-weighted
// + trend model the app uses), then compare to what actually happened.
//
//   node scripts/backtest-release-history.mjs
//
// Reports MAE / median error (days), window coverage, and a breakdown by how many
// training cycles were available — the numbers you tune the model constants against.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DAY = 86_400_000;
const RECENCY = 0.65;

const dataPath = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "release", "release-history.json");
const bundle = JSON.parse(readFileSync(dataPath, "utf8"));

const seasonYearOf = (tsSeconds) => {
  const d = new Date(tsSeconds * 1000);
  return d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
};
const toCycleDate = (tsSeconds, targetYear) => {
  const d = new Date(tsSeconds * 1000);
  const m = d.getUTCMonth();
  const yr = m >= 7 ? targetYear - 1 : targetYear;
  return Date.UTC(yr, m, d.getUTCDate());
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Predict a cycle's mapped first-post from earlier cycles (mirrors history.ts).
function predict(trainPts, targetYear) {
  const pts = trainPts.map((p) => ({ mapped: toCycleDate(p.e, targetYear), year: p.year })).sort((a, b) => a.year - b.year);
  const maxYear = pts[pts.length - 1].year;
  const w = pts.map((p) => Math.pow(RECENCY, maxYear - p.year));
  const wsum = w.reduce((a, b) => a + b, 0);
  const wmean = pts.reduce((a, p, i) => a + p.mapped * w[i], 0) / wsum;
  let typical = wmean;
  if (pts.length >= 3) {
    const xbar = pts.reduce((a, p, i) => a + p.year * w[i], 0) / wsum;
    let num = 0, den = 0;
    pts.forEach((p, i) => { num += w[i] * (p.year - xbar) * (p.mapped - wmean); den += w[i] * (p.year - xbar) ** 2; });
    if (den > 0) {
      const slope = Math.max(-20 * DAY, Math.min(20 * DAY, num / den));
      typical = 0.6 * (wmean + slope * (targetYear - xbar)) + 0.4 * wmean;
    }
  }
  const wvar = pts.reduce((a, p, i) => a + w[i] * (p.mapped - wmean) ** 2, 0) / wsum;
  return { typical, spreadDays: Math.sqrt(wvar) / DAY };
}

const rows = []; // { typical, spreadDays, actual, n, targetYear }

for (const rec of Object.values(bundle.companies)) {
  for (const fam of ["software", "ml-data"]) {
    const seasons = rec.fam?.[fam];
    if (!seasons) continue;
    const cycles = Object.values(seasons).map((c) => ({ e: c.e, year: seasonYearOf(c.e) })).sort((a, b) => a.year - b.year);
    if (cycles.length < 2) continue;
    const heldout = cycles[cycles.length - 1];
    const train = cycles.slice(0, -1);
    const { typical, spreadDays } = predict(train, heldout.year);
    const actual = toCycleDate(heldout.e, heldout.year);
    rows.push({ typical, spreadDays, actual, n: train.length, targetYear: heldout.year });
  }
}

if (rows.length === 0) { console.log("Not enough multi-cycle companies to backtest."); process.exit(0); }

// --- Cohort drift, the CAUSAL way the deployed Radar sees it ---
// When you'd reach out to a company, the only same-cycle signal you have is the
// companies that ALREADY opened. So estimate this cycle's systematic shift from
// peers whose actual open is EARLIER than this company's, and correct the cold
// estimate by it. Mirrors radar.ts: 0.75x median offset, clamped +/-21d, needs >=3.
const DRIFT_MIN_PEERS = 3, DRIFT_CLAMP = 21 * DAY, DRIFT_DAMP = 0.75;
const byYear = new Map();
for (const r of rows) (byYear.get(r.targetYear) ?? byYear.set(r.targetYear, []).get(r.targetYear)).push(r);
for (const r of rows) {
  const peers = byYear.get(r.targetYear).filter((p) => p !== r && p.actual < r.actual);
  if (peers.length >= DRIFT_MIN_PEERS) {
    const raw = DRIFT_DAMP * median(peers.map((p) => p.actual - p.typical));
    const drift = Math.max(-DRIFT_CLAMP, Math.min(DRIFT_CLAMP, raw));
    r.pred = r.typical + drift;
    r.drifted = true;
  } else {
    r.pred = r.typical; // too early in the cycle to know — fall back to cold
    r.drifted = false;
  }
}

const errCold = rows.map((r) => Math.abs(r.typical - r.actual) / DAY);
const errDrift = rows.map((r) => Math.abs(r.pred - r.actual) / DAY);
const maeCold = errCold.reduce((a, b) => a + b, 0) / errCold.length;
const maeDrift = errDrift.reduce((a, b) => a + b, 0) / errDrift.length;
const driftedRows = rows.filter((r) => r.drifted);
const errDriftOnly = driftedRows.map((r) => Math.abs(r.pred - r.actual) / DAY);
const errColdOnDrifted = driftedRows.map((r) => Math.abs(r.typical - r.actual) / DAY);

console.log(`\nRelease Radar backtest  (dataset: ${bundle.generatedAt})`);
console.log(`  companies scored:     ${rows.length}   (drift-correctable: ${driftedRows.length})`);
console.log(`  COLD  model:  MAE ${maeCold.toFixed(1)}d   median ${median(errCold).toFixed(1)}d`);
console.log(`  DEPLOYED (+drift): MAE ${maeDrift.toFixed(1)}d   median ${median(errDrift).toFixed(1)}d`);
if (driftedRows.length) {
  console.log(`  on the ${driftedRows.length} drift-corrected only: cold median ${median(errColdOnDrifted).toFixed(1)}d -> drift median ${median(errDriftOnly).toFixed(1)}d`);
}

// --- What matters for outreach: how often is "reach out by" actually EARLY? ---
// outreachBy = typical - (widthMult * spreadDays + floorDays) - leadDays.
// We want a high "early rate" (actual open is AFTER we started) WITHOUT reaching
// out absurdly early. Sweep configs and report both.
console.log(`\nOutreach timing — goal: high "early" rate, modest median lead:`);
console.log(`  widthMult  floorDays  leadDays |  early%   medianLead  p90Lead`);
for (const widthMult of [1.0, 1.5]) {
  for (const floorDays of [7, 14]) {
    for (const leadDays of [14, 21, 30]) {
      let early = 0; const leads = [];
      for (const r of rows) {
        const outreachBy = r.pred - (widthMult * r.spreadDays + floorDays + leadDays) * DAY;
        const leadD = (r.actual - outreachBy) / DAY; // +ve = we were early
        if (leadD >= 0) early++;
        leads.push(leadD);
      }
      const sorted = [...leads].sort((a, b) => a - b);
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      console.log(`    ${widthMult.toFixed(1)}       ${String(floorDays).padStart(2)}         ${String(leadDays).padStart(2)}     |  ${((early / rows.length) * 100).toFixed(0)}%     ${median(leads).toFixed(0)}d       ${p90.toFixed(0)}d`);
    }
  }
}
console.log(`\n  early% = fraction where you started outreach before the role opened (higher = safer).`);
console.log(`  medianLead = typical days of runway; p90Lead = how early in the worst 10% (avoid too-early).`);
console.log(`\nTune OUTREACH_LEAD_DAYS + half-width in src/release/history.ts, rerun to compare.`);
