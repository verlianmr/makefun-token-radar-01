// Farm plans: one concrete, costed plan per board row, generated from the row's own figures.
//
// Stated assumptions (also printed on the dashboard, so the reader can disagree with them):
//   - one wallet, sized by the protocol's TVL tier; gas averages $8 a transaction on the
//     low-fee chains most of these protocols run on, 3 transactions a week;
//   - a launch, if it comes, puts 5% of the implied value toward early users, and one active
//     wallet's expected share of that pool is 0.1%. Expected value = implied x odds x 5% x
//     0.1%. Verdict: FARM when expected value clears 1.5x the plan's cost, THIN when it
//     clears the cost, SKIP when it does not.

import type { Proto } from './model.ts';

export interface FarmPlan {
  steps: string[]; capital_usd: number; cost_usd: number; weeks: number;
  expected_usd: number; verdict: 'FARM' | 'THIN' | 'SKIP';
}

const GAS_PER_TX = 8;
const TX_PER_WEEK = 3;
export const ALLOC_SHARE = 0.05;
export const WALLET_SHARE = 0.001;

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

function capitalFor(tvl: number): number {
  if (tvl >= 50_000_000) return 1500;
  if (tvl >= 20_000_000) return 1000;
  if (tvl >= 10_000_000) return 750;
  return 500;
}

function weeksFor(odds: number): number {
  if (odds >= 0.5) return 10;
  if (odds >= 0.3) return 12;
  return 8;
}

/** The core product action, by the protocol's own category. */
function coreAction(p: Proto): string {
  const n = p.name;
  switch (p.category) {
    case 'Dexs': return `swap both ways and hold a small liquidity position in ${n}'s main pool`;
    case 'Lending': return `supply collateral and carry a modest, well-collateralised borrow on ${n}`;
    case 'Yield': case 'Yield Aggregator': return `deposit into ${n}'s flagship vault and leave the position to compound`;
    case 'Derivatives': return `trade small, deliberate size on ${n}'s markets, a few round trips a week`;
    case 'RWA': return `complete ${n}'s onboarding and hold a position in its tokenised asset`;
    case 'Risk Curators': return `allocate to a curated vault on ${n} and track its risk reports`;
    case 'Onchain Capital Allocator': return `deposit into ${n}'s allocator and follow its strategy rotations`;
    case 'Launchpad': return `take part in one launch on ${n} and hold the allocation to vesting`;
    case 'Payments': return `route real payments through ${n} so the account history is genuine`;
    default: return `use ${n}'s core product the way a real user would, on its busiest chain`;
  }
}

export function farmPlan(p: Proto, implied: number, odds: number): FarmPlan {
  const capital = capitalFor(p.tvl_usd);
  const weeks = weeksFor(odds);
  const chains = Math.max(1, p.chains.length);
  const mainChain = p.chains[0] ?? 'its main chain';
  const bridgeCost = chains > 1 ? 12 * (chains - 1) : 0;
  const weeklyGas = GAS_PER_TX * TX_PER_WEEK;
  const cost = Math.round(bridgeCost + weeklyGas * weeks);
  const expected = implied * odds * ALLOC_SHARE * WALLET_SHARE;
  const verdict: FarmPlan['verdict'] = expected >= 1.5 * cost ? 'FARM' : expected >= cost ? 'THIN' : 'SKIP';
  const oddsPct = Math.round(odds * 100);

  const steps: string[] = [
    `Set up one wallet for ${p.name} and fund it on ${mainChain} with ${money(capital)} of working capital; bridging in costs about ${money(Math.max(6, bridgeCost || 6))} and an evening of setup.`,
    `Start the core routine in week 1: ${coreAction(p)}. ${p.name} holds ${money(p.tvl_usd)} of TVL, so this size is a real position, not dust the protocol can ignore.`,
    `Keep a cadence of ${TX_PER_WEEK} transactions a week for ${weeks} weeks: about ${money(weeklyGas)} a week in gas at ${money(GAS_PER_TX)} a transaction, ${money(cost)} all-in with bridges over the plan.`,
    chains > 1
      ? `Work ${p.name} on ${chains} chains (${p.chains.slice(0, 3).join(', ')}${chains > 3 ? ' and the rest' : ''}): bridge ${money(12)} per extra chain in week 2 so activity is native everywhere it counts TVL.`
      : `Deepen on ${mainChain} instead of spreading thin: raise the position by a quarter at week 3 if the first weeks tracked cleanly, at the same weekly gas budget.`,
    `Checkpoint at week ${Math.max(2, Math.floor(weeks / 2))}: check ${p.name}'s own points, season or activity page if it runs one, and its governance forum; a launch here is a judgement call, and this board gives it ${oddsPct}% token odds from its peers' record.`,
    `Exit or claim: if a token launches, claim in the first window and sell into the opening liquidity; if nothing has launched by week ${weeks}, wind the position down over one week, recovering the capital less the ${money(cost)} the plan spent.`,
    `Verdict ${verdict}: expected value ${money(expected)} (implied ${money(implied)} x ${oddsPct}% odds x 5% community allocation x 0.1% one-wallet share) against ${money(cost)} of cost over ${weeks} weeks.`,
  ];
  return { steps, capital_usd: capital, cost_usd: cost, weeks, expected_usd: Math.round(expected), verdict };
}

export { money };
