// Token launch radar: the valuation model, the farm plans and the board checks.
//
// The model prices a launch that has not happened from the snapshot's own figures only:
//   implied value = TVL x peer multiple x growth factor x maturity factor
// - peer multiple: the median market-cap / TVL ratio of the protocols in the same
//   DefiLlama category whose token already trades (at least 3 peers, else the global
//   median over every tokenised protocol), clamped to [0.05, 1.50] so one thin
//   category cannot dominate the board.
// - growth factor: the protocol's own 7-day TVL change, clamped to +/-40%, halved
//   before it is applied, so a hot week moves the price by at most +/-20%.
// - maturity factor: +3.5% for each year the protocol has been tracked with no
//   token, capped at 6 years: a long tokenless record means an established product
//   and a user base a launch would be priced on.
// Nothing is keyed to a protocol's name: move the snapshot and the board moves.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  implied_value_usd: number;
  multiple: number;
  peers: number;
  growth_factor: number;
  maturity_factor: number;
  years_tokenless: number | null;
  watchlist: boolean;
  farm_steps: string[];
}

export interface Radar {
  as_of: string;
  source: string;
  floor_usd: number;
  stats: {
    tracked: number;
    board_rows: number;
    watchlist_rows: number;
    early_rows: number;
    combined_tvl_usd: number;
    combined_implied_usd: number;
    global_multiple: number;
  };
  rows: RadarRow[];
}

const BOARD_SIZE = 200;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

export function parseSnapshot(text: string): Snapshot {
  const snap = JSON.parse(text) as Snapshot;
  if (!Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return snap;
}

/** Records no token in the snapshot: no CoinGecko id, no ticker, no market cap. */
function recordsNoToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** The house's wrapped/staked/bridged-product exclusions, applied to the early board too. */
function isProductOfTradedToken(p: Protocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  return EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Median mcap/TVL per category over the tokenised protocols, plus the global median. */
function peerMultiples(snapshot: Snapshot): { byCategory: Map<string, { multiple: number; peers: number }>; global: number } {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      all.push(ratio);
      const key = p.category ?? 'Uncategorised';
      const list = ratios.get(key) ?? [];
      list.push(ratio);
      ratios.set(key, list);
    }
  }
  const global = median(all);
  const byCategory = new Map<string, { multiple: number; peers: number }>();
  for (const [category, list] of ratios) {
    if (list.length >= 3) {
      byCategory.set(category, { multiple: clamp(median(list), 0.05, 1.5), peers: list.length });
    }
  }
  return { byCategory, global: clamp(global, 0.05, 1.5) };
}

function yearsBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return ms / (365.25 * 24 * 3600 * 1000);
}

function growthFactor(change7d: number | null): number {
  if (change7d === null) return 1;
  return 1 + clamp(change7d, -40, 40) / 200;
}

function maturityFactor(p: Protocol, asOf: string): { factor: number; years: number | null } {
  if (p.listed_at === null) return { factor: 1, years: null };
  const years = Math.max(0, yearsBetween(p.listed_at, asOf));
  return { factor: 1 + Math.min(years, 6) * 0.035, years };
}

type Playbook = 'trade' | 'lend' | 'yield' | 'bridge' | 'stake' | 'generic';

function playbookFor(category: string | null): Playbook {
  switch (category) {
    case 'Dexs':
    case 'Derivatives':
    case 'Perps':
    case 'Options':
    case 'DEX Aggregator':
      return 'trade';
    case 'Lending':
    case 'CDP':
    case 'Leveraged Farming':
      return 'lend';
    case 'Yield':
    case 'Yield Aggregator':
    case 'Liquidity Manager':
    case 'Farm':
      return 'yield';
    case 'Cross Chain Bridge':
    case 'Bridge':
    case 'Canonical Bridge':
      return 'bridge';
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaking':
      return 'stake';
    default:
      return 'generic';
  }
}

/** Five concrete steps per protocol, each carrying what it costs and how long it takes. */
function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const chainNote = p.chains.length > 1 ? ` (it also runs on ${p.chains.slice(1, 3).join(' and ')})` : '';
  const size = p.tvl_usd >= 1_000_000_000 ? 'deep' : p.tvl_usd >= 100_000_000 ? 'mid-sized' : 'early';
  const open = `Open ${p.name}'s official app from its DefiLlama page, connect a fresh wallet on ${chain}${chainNote} and make one small test transaction to learn the interface. Cost: about $1-5 in gas. Time: 15 minutes.`;
  const track = `Follow ${p.name}'s official X and Discord and turn on announcements, so a points program, snapshot or claim page is not missed; keep a dated log of every action and transaction hash. Cost: $0. Time: 10 minutes, then 5 minutes a week.`;
  const risk = `Size positions as a farm, not an investment: this ${size} protocol records no token, a launch is never promised, and smart-contract risk is real. Never borrow to farm it and never sign approvals you do not recognise. Cost: $0. Time: 5 minutes to review monthly.`;
  const book = playbookFor(p.category);
  if (book === 'trade') {
    return [
      open,
      `Trade through ${p.name}'s own interface rather than an aggregator: swap $50-$250 of a liquid pair on ${chain} so the volume is recorded under your wallet. Cost: about $1-6 in gas plus under $1 of slippage. Time: 10 minutes.`,
      `Repeat the swap weekly for 6-8 weeks and vary the pairs and sizes slightly, the pattern of a real user rather than a single airdrop transaction. Cost: about $1-6 a week in gas. Time: 10 minutes a week.`,
      `Try one advanced feature the interface offers, such as a limit order, a second pair or its other chain deployment, once the basic flow is familiar. Cost: about $1-5 in gas. Time: 15 minutes.`,
      track,
      risk,
    ];
  }
  if (book === 'lend') {
    return [
      open,
      `Supply $100-$500 of a major asset (ETH or a large stablecoin) to a core ${p.name} market on ${chain} and leave it supplied; lenders are the users a launch usually rewards first. Cost: about $2-8 in gas. Time: 10 minutes.`,
      `Borrow a small amount, at most 25% of what you supplied, and repay it within a few days to record both sides of the market without running liquidation risk. Cost: about $2-6 in gas plus a little interest. Time: 15 minutes.`,
      `Keep the position open for at least 6-8 weeks and top it up once, rather than depositing and withdrawing in the same week. Cost: about $2-6 in gas for the top-up. Time: 5 minutes.`,
      track,
      risk,
    ];
  }
  if (book === 'yield') {
    return [
      open,
      `Deposit $100-$500 into ${p.name}'s flagship vault or pool on ${chain} and hold the position; vault depositors are the clearest users to reward at a launch. Cost: about $2-8 in gas. Time: 10 minutes.`,
      `Claim or compound the yield once a month instead of daily, so gas does not eat the return and the wallet shows a steady holding pattern. Cost: about $1-4 in gas a month. Time: 5 minutes a month.`,
      `Add a second, smaller deposit in a different month, then hold both for a full quarter before judging the farm. Cost: about $2-6 in gas. Time: 10 minutes.`,
      track,
      risk,
    ];
  }
  if (book === 'bridge') {
    return [
      open,
      `Bridge $50-$200 from ${chain} to one other chain ${p.name} supports, using its own interface rather than a third-party front end. Cost: about $2-10 in gas and bridge fees. Time: 15 minutes including the wait.`,
      `Bridge back, or onward to a third chain, the following week so the wallet shows routes in both directions. Cost: about $2-10. Time: 15 minutes.`,
      `Repeat a small bridge monthly for a quarter, and once bridge an asset other than the one you first used. Cost: about $2-10 a month. Time: 15 minutes a month.`,
      track,
      risk,
    ];
  }
  if (book === 'stake') {
    return [
      open,
      `Stake a small amount, $50-$200 worth of the base asset, through ${p.name} on ${chain} and hold the receipt position instead of selling it on. Cost: about $2-8 in gas. Time: 10 minutes.`,
      `Use the staked position once inside the ecosystem, for example as collateral or in a paired pool the protocol itself points to. Cost: about $2-6 in gas. Time: 15 minutes.`,
      `Top the stake up once after a month and hold the combined position for a full quarter. Cost: about $2-6 in gas. Time: 10 minutes.`,
      track,
      risk,
    ];
  }
  return [
    open,
    `Use ${p.name}'s core product on ${chain} with a real, small amount ($50-$250 of value) rather than only connecting a wallet; usage, not connections, is what a launch can measure. Cost: about $1-8 in gas or fees. Time: 15 minutes.`,
    `Come back weekly for 6-8 weeks and repeat the core action, adding one feature you have not tried each visit. Cost: about $1-8 a week. Time: 10 minutes a week.`,
    `Complete any in-product profile, referral or quest step ${p.name} itself offers, since those lists are often reused when a launch is organised. Cost: $0-5. Time: 10 minutes.`,
    track,
    risk,
  ];
}

/** Score every board protocol, rank by implied value, and shape the dashboard's data. */
export function buildRadar(snapshot: Snapshot): { board: RadarRow[]; radar: Radar } {
  const watch = new Set(snapshot.watchlist);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const eligible = snapshot.protocols.filter((p) => recordsNoToken(p) && !isProductOfTradedToken(p));
  const early = eligible
    .filter((p) => !watch.has(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  const picked: Protocol[] = [];
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p !== undefined) picked.push(p);
  }
  for (const p of early) {
    if (picked.length >= BOARD_SIZE) break;
    picked.push(p);
  }

  const { byCategory, global } = peerMultiples(snapshot);
  const rows: RadarRow[] = picked.map((p) => {
    const peer = p.category !== null ? byCategory.get(p.category) : undefined;
    const multiple = peer?.multiple ?? global;
    const peers = peer?.peers ?? 0;
    const gf = growthFactor(p.change_7d);
    const mf = maturityFactor(p, snapshot.as_of);
    const implied = Math.max(1000, Math.round(p.tvl_usd * multiple * gf * mf.factor));
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      implied_value_usd: implied,
      multiple: Math.round(multiple * 1000) / 1000,
      peers,
      growth_factor: Math.round(gf * 1000) / 1000,
      maturity_factor: Math.round(mf.factor * 1000) / 1000,
      years_tokenless: mf.years === null ? null : Math.round(mf.years * 10) / 10,
      watchlist: watch.has(p.slug),
      farm_steps: farmSteps(p),
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  const radar: Radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    stats: {
      tracked: snapshot.protocols.length,
      board_rows: rows.length,
      watchlist_rows: rows.filter((r) => r.watchlist).length,
      early_rows: rows.filter((r) => !r.watchlist).length,
      combined_tvl_usd: rows.reduce((sum, r) => sum + r.tvl_usd, 0),
      combined_implied_usd: rows.reduce((sum, r) => sum + r.implied_value_usd, 0),
      global_multiple: global,
    },
    rows,
  };
  return { board: rows, radar };
}

/** The script the dashboard loads: the whole radar as one global. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** Every gate rule for board.json, checked before anything is written. Returns the first problem, or null. */
export function boardIssue(board: RadarRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100-4000`;
  const slugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const ranks = new Set<number>();
  let previous = Number.POSITIVE_INFINITY;
  let allEqual = board.length > 1;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (const row of byRank) {
    if (!slugs.has(row.slug)) return `row ${row.slug} is not a snapshot protocol`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.name.trim() === '') return `row ${row.slug} has an empty name`;
    if (!Number.isInteger(row.rank) || row.rank <= 0) return `row ${row.slug} has a bad rank`;
    if (ranks.has(row.rank)) return `rank ${row.rank} appears twice`;
    ranks.add(row.rank);
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0 || row.implied_value_usd > 100_000_000_000_000) {
      return `row ${row.slug} has an implied value outside the gate's range`;
    }
    if (row.implied_value_usd > previous) return `implied value rises at rank ${row.rank}`;
    if (row.implied_value_usd !== byRank[0]!.implied_value_usd) allEqual = false;
    previous = row.implied_value_usd;
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${Array.isArray(row.farm_steps) ? row.farm_steps.length : 'no'} farm steps`;
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `row ${row.slug} has a farm step of ${len} characters`;
    }
  }
  for (let rank = 1; rank <= board.length; rank++) {
    if (!ranks.has(rank)) return `rank ${rank} is missing`;
  }
  if (allEqual) return 'every implied value is the same: the board ranks nothing';
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}
