#!/usr/bin/env node
/* Atlas Lenses probe: the "morning numbers" the Lenses UI makes visible.
 *
 *   node scripts/lens-probe.js            # as of the current month
 *   node scripts/lens-probe.js 2026-10    # as of a given month
 *
 * Every number is computed from data/*.yml through the shared loader, so it
 * can be re-run at any time (the 3:25 PM re-probe) and never drifts.
 * The six doubt signals use the same rules as trustOf()/signalsOf() in index.html.
 */
const { loadData } = require("./load-data");
const { DATA, CATS } = loadData();

const asOf = process.argv[2] || new Date().toISOString().slice(0, 7);
const mIdx = ym => { const [y, m] = ym.split("-"); return +y * 12 + +m; };
const FUNDER = new Set(["vc", "angel"]);
// a funder states a check size when a fact label says so
const CHECK_RE = /check|ticket|investment size|cheque/i;
const hasCheck = d => (d.facts || []).some(f => CHECK_RE.test(f[0]));

const deg = new Map(DATA.map(d => [d.id, new Set()]));
let edges = 0;
for (const d of DATA) for (const t of d.links || []) {
  if (!deg.has(t) || deg.get(d.id).has(t)) continue;
  deg.get(d.id).add(t); deg.get(t).add(d.id); edges++;
}
const hist = key => DATA.reduce((h, d) => (h[d[key] || "none"] = (h[d[key] || "none"] || 0) + 1, h), {});
const funders = DATA.filter(d => FUNDER.has(d.cat));
const ageOf = d => d.lastVerified ? mIdx(asOf) - mIdx(d.lastVerified) : null;

const rows = [
  ["entries", DATA.length],
  ["categories", Object.keys(CATS).length],
  ["approximate pins (approx: true)", DATA.filter(d => d.approx).length],
  ["entries with no connections (in or out)", DATA.filter(d => deg.get(d.id).size === 0).length],
  ["undirected edges", edges],
  ["startups with no stage", DATA.filter(d => d.cat === "startup" && !(d.stages || []).length).length],
  ["funders (vc + angel)", funders.length],
  ["funders with no stated check size", funders.filter(d => !hasCheck(d)).length],
  ["funders with a deadline (applyBy)", funders.filter(d => d.applyBy).length],
  ["entries with applyBy rolling", DATA.filter(d => d.applyBy === "rolling").length],
  ["entries with a dated applyBy", DATA.filter(d => d.applyBy && d.applyBy !== "rolling").length],
  [`added in ${asOf} (new this month)`, DATA.filter(d => d.added === asOf).length],
  [`verified 4+ months before ${asOf}`, DATA.filter(d => ageOf(d) >= 4).length],
];
console.log(`Atlas Lenses probe — as of ${asOf}\n`);
for (const [k, v] of rows) console.log(String(v).padStart(5) + "  " + k);
console.log("\nlastVerified:", hist("lastVerified"));
console.log("added:       ", hist("added"));
console.log("check-size fact labels seen:",
  [...new Set(funders.flatMap(d => (d.facts || []).map(f => f[0])))].join(" | "));
