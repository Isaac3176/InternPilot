import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSET_DIR = "dist/assets";
const KIB = 1024;

const budgets = {
  totalGzipKiB: 1250,
  jsGzipKiB: 1210,
  cssGzipKiB: 45,
  maxChunkGzipKiB: 150,
  maxChunkRawKiB: 1400,
};

const assetBudgets = [
  {
    test: /^pdf\.worker\.min-.*\.mjs$/,
    maxGzipKiB: 390,
    maxRawKiB: 1300,
  },
];

function kib(bytes) {
  return bytes / KIB;
}

function fmt(bytes) {
  return `${kib(bytes).toFixed(1)} KiB`;
}

function fail(message, rows) {
  console.error(`\nBundle budget failed: ${message}`);
  if (rows?.length) {
    console.error("\nLargest assets:");
    for (const row of rows.slice(0, 12)) {
      console.error(`- ${row.name}: ${fmt(row.gzip)} gzip, ${fmt(row.raw)} raw`);
    }
  }
  process.exitCode = 1;
}

let names;
try {
  names = readdirSync(ASSET_DIR).filter((name) => /\.(css|js|mjs)$/.test(name));
} catch {
  fail(`missing ${ASSET_DIR}. Run npm run build before npm run check:bundle.`);
  process.exit();
}

const assets = names.map((name) => {
  const path = join(ASSET_DIR, name);
  const raw = statSync(path).size;
  const gzip = gzipSync(readFileSync(path)).length;
  const kind = name.endsWith(".css") ? "css" : "js";
  return { name, raw, gzip, kind };
});

const jsGzip = assets.filter((asset) => asset.kind === "js").reduce((sum, asset) => sum + asset.gzip, 0);
const cssGzip = assets.filter((asset) => asset.kind === "css").reduce((sum, asset) => sum + asset.gzip, 0);
const totalGzip = jsGzip + cssGzip;
const largest = [...assets].sort((a, b) => b.gzip - a.gzip);
const tooLarge = assets.filter(
  (asset) => {
    const override = assetBudgets.find((budget) => budget.test.test(asset.name));
    const maxGzipKiB = override?.maxGzipKiB ?? budgets.maxChunkGzipKiB;
    const maxRawKiB = override?.maxRawKiB ?? budgets.maxChunkRawKiB;
    return kib(asset.gzip) > maxGzipKiB || kib(asset.raw) > maxRawKiB;
  },
);

console.log("Bundle size report");
console.log(`- Total gzip: ${fmt(totalGzip)} / ${budgets.totalGzipKiB} KiB`);
console.log(`- JS gzip:    ${fmt(jsGzip)} / ${budgets.jsGzipKiB} KiB`);
console.log(`- CSS gzip:   ${fmt(cssGzip)} / ${budgets.cssGzipKiB} KiB`);
console.log(`- Assets:     ${assets.length}`);

if (kib(totalGzip) > budgets.totalGzipKiB) {
  fail(`total gzip exceeds ${budgets.totalGzipKiB} KiB`, largest);
} else if (kib(jsGzip) > budgets.jsGzipKiB) {
  fail(`JavaScript gzip exceeds ${budgets.jsGzipKiB} KiB`, largest);
} else if (kib(cssGzip) > budgets.cssGzipKiB) {
  fail(`CSS gzip exceeds ${budgets.cssGzipKiB} KiB`, largest);
} else if (tooLarge.length) {
  fail(
    `one or more assets exceed ${budgets.maxChunkGzipKiB} KiB gzip or ${budgets.maxChunkRawKiB} KiB raw`,
    tooLarge.sort((a, b) => b.gzip - a.gzip),
  );
} else {
  console.log("Bundle budget passed.");
}
