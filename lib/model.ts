// Token Radar model: everything is fitted at run time from the snapshot itself.
//
// Pipeline (deterministic, no clock, no Math.random):
//   1. Classify all 758 protocols: live (a token is recorded), watchlist (the snapshot's own
//      list), candidate (no token recorded, below the floor, passes the same product filters
//      the watchlist rule uses), set aside (no token, but a wrapped/staked/bridged/versioned
//      or exchange product, with the reason kept).
//   2. Fit a comps model on the protocols whose token already trades: log10(market cap) as a
//      linear function of snapshot figures. Candidate term groups are chosen by a held-out
//      ablation (two folds), never by hand: a term group earns its place or it is dropped.
//   3. Token odds from the snapshot's own record: in each age x size bucket, the share of
//      protocols that already record a token, Laplace-smoothed toward the global rate.
//   4. Rank ranges from 200 seeded bootstrap refits of the chosen model.
//
// No protocol name is ever special-cased; the same code scores every row.

export interface Proto {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}

export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: Proto[]; watchlist: string[];
}

export function parseSnapshot(text: string): Snapshot {
  const o = JSON.parse(text) as Snapshot;
  if (!Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) throw new Error('snapshot shape');
  return o;
}

// ---------- small deterministic helpers ----------

/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 PRNG: same seed, same stream, on every machine. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`), b = Date.parse(`${listedAt}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((a - b) / 86_400_000));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// ---------- classification ----------

const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;

export type Class = 'live' | 'watchlist' | 'candidate' | 'setaside';

export function hasToken(p: Proto): boolean {
  return p.gecko_id !== null || p.symbol !== null || p.mcap_usd !== null;
}

/** Why a tokenless protocol is a product of another token, or null when it is a candidate. */
export function setAsideReason(p: Proto): string | null {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return `category ${p.category}: a product of a token that already trades`;
  if (VERSION_SUFFIX.test(p.name)) return 'name ends in a version marker: a later version of a protocol, not a first launch';
  if (PRODUCT_WORD.test(p.name)) return 'name carries wrapped/staked: a product of a token that already trades';
  for (const ex of EXCHANGE_PREFIXES) if (p.name.startsWith(`${ex} `) || p.name === ex) return 'name begins with an exchange: an exchange product, not an independent launch';
  return null;
}

export function classify(snapshot: Snapshot): Map<string, { cls: Class; reason: string | null }> {
  const watch = new Set(snapshot.watchlist);
  const out = new Map<string, { cls: Class; reason: string | null }>();
  for (const p of snapshot.protocols) {
    if (hasToken(p)) out.set(p.slug, { cls: 'live', reason: null });
    else if (watch.has(p.slug)) out.set(p.slug, { cls: 'watchlist', reason: null });
    else {
      const r = setAsideReason(p);
      out.set(p.slug, r === null ? { cls: 'candidate', reason: null } : { cls: 'setaside', reason: r });
    }
  }
  return out;
}

// ---------- comps regression (OLS with a small ridge, closed form) ----------

export type TermGroup = 'tvl' | 'growth' | 'age' | 'category';
export interface TermSet { name: string; groups: TermGroup[] }

export const TERM_SETS: TermSet[] = [
  { name: 'tvl', groups: ['tvl'] },
  { name: 'tvl+growth', groups: ['tvl', 'growth'] },
  { name: 'tvl+age', groups: ['tvl', 'age'] },
  { name: 'tvl+growth+age', groups: ['tvl', 'growth', 'age'] },
  { name: 'tvl+category', groups: ['tvl', 'category'] },
  { name: 'tvl+growth+age+category', groups: ['tvl', 'growth', 'age', 'category'] },
];

interface Design { cats: string[]; medianAge: number }

function designFor(train: Proto[], asOf: string): Design {
  const counts = new Map<string, number>();
  for (const p of train) if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const cats = [...counts.entries()].filter(([, n]) => n >= 8).map(([c]) => c).sort();
  const ages = train.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  return { cats, medianAge: ages.length ? median(ages) : 730 };
}

function features(p: Proto, asOf: string, groups: TermGroup[], d: Design): number[] {
  const x = [1, Math.log10(Math.max(1, p.tvl_usd))];
  if (groups.includes('growth')) x.push(clamp(p.change_7d ?? 0, -90, 300) / 100);
  if (groups.includes('age')) x.push(Math.log10(1 + (ageDays(asOf, p.listed_at) ?? d.medianAge)));
  if (groups.includes('category')) for (const c of d.cats) x.push(p.category === c ? 1 : 0);
  return x;
}

/** Solve (X'X + ridge) beta = X'y by Gauss-Jordan with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const div = M[col]![col]! || 1e-12;
    for (let j = col; j <= n; j++) M[col]![j]! /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]!;
      if (f === 0) continue;
      for (let j = col; j <= n; j++) M[r]![j]! -= f * M[col]![j]!;
    }
  }
  return M.map((row) => row[n]!);
}

export interface Fit { beta: number[]; design: Design; groups: TermGroup[]; calibration: number }

export function fitModel(train: Proto[], asOf: string, groups: TermGroup[]): Fit {
  const d = designFor(train, asOf);
  const X = train.map((p) => features(p, asOf, groups, d));
  const y = train.map((p) => Math.log10(Math.max(1, p.mcap_usd ?? 1)));
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a]! += X[i]![a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += X[i]![a]! * X[i]![c]!;
    }
  }
  for (let a = 1; a < k; a++) A[a]![a]! += 1.0; // ridge on every term but the intercept
  const beta = solve(A, b);
  const ratios = train.map((p, i) => (p.mcap_usd ?? 1) / Math.pow(10, X[i]!.reduce((s, v, j) => s + v * beta[j]!, 0)));
  return { beta, design: d, groups, calibration: clamp(median(ratios), 0.4, 2.5) };
}

export function predict(fit: Fit, p: Proto, asOf: string): number {
  const x = features(p, asOf, fit.groups, fit.design);
  const logv = x.reduce((s, v, j) => s + v * fit.beta[j]!, 0);
  return Math.pow(10, logv) * fit.calibration;
}

// ---------- held-out evaluation + ablation ----------

function spearman(pred: number[], actual: number[]): number {
  const rank = (xs: number[]): number[] => {
    const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array<number>(xs.length);
    order.forEach(([, i], pos) => { r[i] = pos; });
    return r;
  };
  const rp = rank(pred), ra = rank(actual), n = pred.length;
  const mp = rp.reduce((s, v) => s + v, 0) / n, ma = ra.reduce((s, v) => s + v, 0) / n;
  let cov = 0, vp = 0, va = 0;
  for (let i = 0; i < n; i++) { cov += (rp[i]! - mp) * (ra[i]! - ma); vp += (rp[i]! - mp) ** 2; va += (ra[i]! - ma) ** 2; }
  return vp && va ? cov / Math.sqrt(vp * va) : 0;
}

export interface FoldScore { medianAbsLogErr: number; spearman: number; n: number }
export interface AblationRow { terms: string; foldA: FoldScore; foldB: FoldScore; score: number }

function evalOn(train: Proto[], test: Proto[], asOf: string, groups: TermGroup[]): FoldScore {
  const fit = fitModel(train, asOf, groups);
  const errs: number[] = [], preds: number[] = [], acts: number[] = [];
  for (const p of test) {
    const pred = predict(fit, p, asOf);
    errs.push(Math.abs(Math.log10(pred / Math.max(1, p.mcap_usd ?? 1))));
    preds.push(pred); acts.push(p.mcap_usd ?? 1);
  }
  return { medianAbsLogErr: median(errs), spearman: spearman(preds, acts), n: test.length };
}

/** Two deterministic folds: slug-hash parity, and a walk-forward split on listed_at. */
export function folds(train: Proto[]): { a: [Proto[], Proto[]]; b: [Proto[], Proto[]] } {
  const aTest = train.filter((p) => hash32(p.slug) % 2 === 0);
  const aTrain = train.filter((p) => hash32(p.slug) % 2 === 1);
  const byAge = [...train].sort((x, y) => (x.listed_at ?? '9999').localeCompare(y.listed_at ?? '9999') || x.slug.localeCompare(y.slug));
  const cut = Math.floor(byAge.length * 0.6);
  return { a: [aTrain, aTest], b: [byAge.slice(0, cut), byAge.slice(cut)] };
}

export function ablate(train: Proto[], asOf: string): { rows: AblationRow[]; best: TermSet } {
  const f = folds(train);
  const rows = TERM_SETS.map((ts) => {
    const fa = evalOn(f.a[0], f.a[1], asOf, ts.groups);
    const fb = evalOn(f.b[0], f.b[1], asOf, ts.groups);
    const score = (fa.medianAbsLogErr + fb.medianAbsLogErr) / 2 - 0.05 * ((fa.spearman + fb.spearman) / 2);
    return { terms: ts.name, foldA: fa, foldB: fb, score };
  });
  let best = TERM_SETS[0]!;
  let bestScore = Infinity;
  rows.forEach((r, i) => { if (r.score < bestScore) { bestScore = r.score; best = TERM_SETS[i]!; } });
  return { rows, best };
}

// ---------- token odds ----------

export interface OddsModel { global: number; buckets: Map<string, number> }

function ageBand(p: Proto, asOf: string): string {
  const a = ageDays(asOf, p.listed_at);
  if (a === null) return 'age?';
  return a < 365 ? '<1y' : a < 730 ? '1-2y' : a < 1460 ? '2-4y' : '>4y';
}
function tvlBand(p: Proto): string { return p.tvl_usd < 10_000_000 ? '<10M' : p.tvl_usd < 50_000_000 ? '10-50M' : '>=50M'; }

export function fitOdds(snapshot: Snapshot): OddsModel {
  const all = snapshot.protocols;
  const global = all.filter(hasToken).length / all.length;
  const counts = new Map<string, { k: number; n: number }>();
  for (const p of all) {
    const key = `${ageBand(p, snapshot.as_of)}|${tvlBand(p)}`;
    const c = counts.get(key) ?? { k: 0, n: 0 };
    c.n++; if (hasToken(p)) c.k++;
    counts.set(key, c);
  }
  const buckets = new Map<string, number>();
  for (const [key, c] of counts) buckets.set(key, (c.k + 20 * global) / (c.n + 20));
  return { global, buckets };
}

export function oddsOf(m: OddsModel, p: Proto, asOf: string): number {
  return m.buckets.get(`${ageBand(p, asOf)}|${tvlBand(p)}`) ?? m.global;
}

// ---------- rank ranges by seeded bootstrap ----------

export function rankRanges(train: Proto[], boardProtos: Proto[], asOf: string, groups: TermGroup[], base: Map<string, number>): Map<string, { lo: number; hi: number }> {
  const rand = rng(20261114);
  const ranks = new Map<string, number[]>(boardProtos.map((p) => [p.slug, []]));
  const B = 200;
  for (let b = 0; b < B; b++) {
    const sample = Array.from({ length: train.length }, () => train[Math.floor(rand() * train.length)]!);
    const fit = fitModel(sample, asOf, groups);
    const scored = boardProtos.map((p) => ({ slug: p.slug, v: predict(fit, p, asOf) }));
    scored.sort((x, y) => y.v - x.v || (base.get(x.slug)! - base.get(y.slug)!));
    scored.forEach((s, i) => ranks.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, { lo: number; hi: number }>();
  for (const [slug, rs] of ranks) {
    const s = [...rs].sort((a, b) => a - b);
    out.set(slug, { lo: s[Math.floor(0.1 * (s.length - 1))]!, hi: s[Math.floor(0.9 * (s.length - 1))]! });
  }
  return out;
}
