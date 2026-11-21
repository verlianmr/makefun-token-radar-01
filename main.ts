// Token Radar (Node 22, standard library only): reads the sealed snapshot, fits its value
// model at run time, and hands in a ranked board, a dashboard and a dossier.
//
//   node main.ts --input <snapshot.json|dir>   (or /input mounted, MAKEFUN_OUTPUT_DIR for /output)
//
// Outputs in the output directory: board.json (the ranked board), data.js (the dashboard's
// data, written beside dashboard/), dashboard/ and screenshots/ copied from this repository,
// and dossier.json from the vendored buildDossier, written last and byte-checked by the gate.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ablate, ageDays, classify, fitModel, fitOdds, hasToken, oddsOf, parseSnapshot, predict, rankRanges,
  type Proto, type Snapshot,
} from './lib/model.ts';
import { farmPlan } from './lib/farm.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot: Snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const asOf = snapshot.as_of;

// ---- model: choose terms by held-out ablation, then fit on every traded token ----
const train = snapshot.protocols.filter((p) => (p.mcap_usd ?? 0) > 0);
const ablation = ablate(train, asOf);
const fit = fitModel(train, asOf, ablation.best.groups);
const oddsModel = fitOdds(snapshot);
const classes = classify(snapshot);

const boardProtos = snapshot.protocols.filter((p) => {
  const c = classes.get(p.slug)!.cls;
  return c === 'watchlist' || c === 'candidate';
});

interface Row {
  slug: string; name: string; rank: number; implied_value_usd: number; farm_steps: string[];
  cls: string; category: string | null; chains: string[]; tvl_usd: number; change_7d: number | null;
  age_days: number | null; token_odds: number; rank_lo: number; rank_hi: number;
  verdict: string; cost_usd: number; weeks: number; expected_usd: number; capital_usd: number;
}

const baseImplied = new Map<string, number>();
for (const p of boardProtos) baseImplied.set(p.slug, Math.max(1000, Math.round(predict(fit, p, asOf))));
const ranges = rankRanges(train, boardProtos, asOf, ablation.best.groups, baseImplied);

const rows: Row[] = boardProtos
  .map((p) => {
    const implied = baseImplied.get(p.slug)!;
    const odds = oddsOf(oddsModel, p, asOf);
    const plan = farmPlan(p, implied, odds);
    const r = ranges.get(p.slug)!;
    return {
      slug: p.slug, name: p.name, rank: 0, implied_value_usd: implied, farm_steps: plan.steps,
      cls: classes.get(p.slug)!.cls, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
      change_7d: p.change_7d === null ? null : Math.round(p.change_7d * 100) / 100,
      age_days: ageDays(asOf, p.listed_at), token_odds: Math.round(odds * 1000) / 10,
      rank_lo: r.lo, rank_hi: r.hi, verdict: plan.verdict, cost_usd: plan.cost_usd, weeks: plan.weeks,
      expected_usd: plan.expected_usd, capital_usd: plan.capital_usd,
    };
  })
  .sort((a, b) => b.implied_value_usd - a.implied_value_usd || a.slug.localeCompare(b.slug));
rows.forEach((r, i) => { r.rank = i + 1; });

// ---- self-check: refuse to hand in a board the gate would refuse ----
function gateIssue(): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows`;
  const seen = new Set<string>();
  for (const [i, r] of rows.entries()) {
    if (r.rank !== i + 1) return `rank sequence broken at ${r.slug}`;
    if (i && rows[i - 1]!.implied_value_usd < r.implied_value_usd) return `implied value rises at rank ${r.rank}`;
    if (seen.has(r.slug)) return `duplicate slug ${r.slug}`;
    seen.add(r.slug);
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug}: ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const n = s.trim().length;
      if (n < 20 || n > 600) return `${r.slug}: a farm step of ${n} characters`;
    }
  }
  for (const s of snapshot.watchlist) if (!seen.has(s)) return `watchlist slug ${s} missing from the board`;
  return null;
}
const issue = gateIssue();
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// ---- dashboard data: the board, the live set, the set-asides, and the validation record ----
const live = snapshot.protocols.filter(hasToken).map((p) => ({
  slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd,
  ratio: Math.round(((p.mcap_usd ?? 0) / Math.max(1, p.tvl_usd)) * 100) / 100,
})).sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0));
const setAside = snapshot.protocols
  .filter((p) => classes.get(p.slug)!.cls === 'setaside')
  .map((p) => ({ slug: p.slug, name: p.name, reason: classes.get(p.slug)!.reason! }));
const counts = { live: 0, watchlist: 0, candidate: 0, setaside: 0 };
for (const { cls } of classes.values()) counts[cls as keyof typeof counts]++;

const radar = {
  as_of: asOf, source: snapshot.source, floor_usd: snapshot.floor_usd,
  total: snapshot.protocols.length, counts,
  model: {
    train_n: train.length, terms: ablation.best.name, calibration: Math.round(fit.calibration * 1000) / 1000,
    ablation: ablation.rows.map((r) => ({
      terms: r.terms,
      fold_a_err: Math.round(r.foldA.medianAbsLogErr * 1000) / 1000, fold_a_rho: Math.round(r.foldA.spearman * 1000) / 1000,
      fold_b_err: Math.round(r.foldB.medianAbsLogErr * 1000) / 1000, fold_b_rho: Math.round(r.foldB.spearman * 1000) / 1000,
    })),
    chosen: {
      fold_a_err: Math.round(ablation.rows.find((r) => r.terms === ablation.best.name)!.foldA.medianAbsLogErr * 1000) / 1000,
      fold_b_err: Math.round(ablation.rows.find((r) => r.terms === ablation.best.name)!.foldB.medianAbsLogErr * 1000) / 1000,
    },
    odds_global: Math.round(oddsModel.global * 1000) / 10,
  },
  rows, live: live.slice(0, 40), set_aside_sample: setAside.slice(0, 24), set_aside_total: setAside.length,
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: rows.map((r) => ({
  slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.implied_value_usd, farm_steps: r.farm_steps,
  token_odds_pct: r.token_odds, rank_range: [r.rank_lo, r.rank_hi], verdict: r.verdict, cls: r.cls,
})) })}\n`);
writeFileSync(join(out, 'data.js'), `window.RADAR = ${JSON.stringify(radar)};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images: hand in 3\n`);
  process.exit(1);
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols (${counts.live} live, ${counts.watchlist} watchlist, ${counts.candidate} candidates, ${counts.setaside} set aside), ${rows.length} board rows, model ${ablation.best.name} on ${train.length} traded tokens\n`,
);
