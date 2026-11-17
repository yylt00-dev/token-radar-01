// Token Launch Radar model: turns the sealed DefiLlama snapshot into a ranked board of
// pre-token protocols, each with an implied token value derived only from the snapshot's
// own figures, plus a concrete farm plan per protocol.
//
// Implied value model (every factor is computed from the snapshot at run time):
//   implied = TVL x category multiple x momentum x maturity x reach
// - category multiple: the median market-cap / TVL ratio of the protocols in the same
//   category whose token already trades in this snapshot (the snapshot prices its own
//   categories; no hand-kept list of names or ratios).
// - momentum: the protocol's 7-day TVL change, clamped so one hot week cannot dominate.
// - maturity: how long the protocol has run with no token (listed_at to the snapshot's
//   as_of date): a longer record earns a premium, a brand-new listing a discount.
// - reach: +4% per chain beyond the first, capped at +20%: distribution already built.
// Protocols whose token already trades are never ranked as launches; they are reported
// separately as the live reference set the multiples are learned from.

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

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

export interface RadarRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  multiple: number;
  momentum: number;
  maturity: number;
  reach: number;
  watchlist: boolean;
}

export interface Radar {
  as_of: string;
  floor_usd: number;
  rows: RadarRow[];
  live: { slug: string; name: string; symbol: string | null; mcap_usd: number; tvl_usd: number }[];
  multiples: { category: string; multiple: number; peers: number }[];
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Days between an ISO day and the snapshot's as_of day; null when either is missing. */
function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${listedAt}T00:00:00Z`);
  const b = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Category multiples learned from the snapshot's own tokenised protocols. */
export function categoryMultiples(snapshot: Snapshot): Map<string, { multiple: number; peers: number }> {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) {
      const ratio = p.mcap_usd / p.tvl_usd;
      if (ratio > 0.02 && ratio < 40) {
        all.push(ratio);
        const key = p.category ?? 'Uncategorised';
        const list = byCategory.get(key) ?? [];
        list.push(ratio);
        byCategory.set(key, list);
      }
    }
  }
  const globalMedian = all.length > 0 ? median(all) : 0.85;
  const out = new Map<string, { multiple: number; peers: number }>();
  for (const [category, ratios] of byCategory) {
    // Blend a thin category toward the global median so two peers cannot set a wild price.
    const own = median(ratios);
    const weight = Math.min(1, ratios.length / 6);
    out.set(category, { multiple: own * weight + globalMedian * (1 - weight), peers: ratios.length });
  }
  out.set('__global__', { multiple: globalMedian, peers: all.length });
  return out;
}

const GENERIC_STEPS = [
  'Open the protocol app on {chain} and connect a fresh wallet you use only for farming; keep a small gas float ({gas}) in the wallet so a stuck week never strands the position.',
  'Make a first deposit of {stake} into the main {category} market on {chain}; a real, balance-carrying position is what points and activity snapshots almost always count.',
  'Repeat a small action every week for at least 8 weeks: add or roll {roll} of the position, vote or claim whenever the app offers it, and keep the streak unbroken rather than depositing once and going quiet.',
  'Spread to a second surface the protocol offers (a second market, chain or product line) with about a quarter of the position; multi-surface users are the cohort most launches reward first.',
  'Track the points or season page weekly and screenshot your balance; if a snapshot or season end is announced, keep the full position in place until it closes instead of rotating out early.',
];

const CATEGORY_STEPS: Record<string, string[]> = {
  Lending: [
    'Supply {stake} of a blue-chip asset (ETH or a major stablecoin) to the main lending market on {chain}; supplying, not borrowing, is the low-risk side and the side most points programs weight.',
    'Borrow at most 25% against the supply and re-supply it once, then repay within the same week: one clean loop shows real usage without leaving liquidation risk open.',
    'Hold the supply for at least 8 weeks and claim every reward the market shows; long, steady supply balances are what lending snapshots have historically counted.',
  ],
  Dexs: [
    'Provide {stake} of liquidity to the busiest pair on {chain} (the pair with the deepest pool), in range if the venue is concentrated; fees earned are the clearest usage signal a DEX keeps.',
    'Swap small amounts ({roll} a session, twice a week) through the main router so the wallet shows organic volume on top of the liquidity position.',
    'Keep the LP position open for at least 8 weeks and re-balance weekly if it drifts out of range; duration plus volume is the combination most DEX launches reward.',
  ],
  'Liquid Staking': [
    'Stake {stake} of the base asset through the main contract on {chain} and hold the liquid staking token in the same wallet; do not sell it on a DEX, the held balance is the record.',
    'Put about a quarter of the staking token to work in one integrated venue the protocol lists (a lending market or LP) so the wallet shows both staking and DeFi usage.',
    'Add a small top-up stake every two weeks for at least 8 weeks; a rising, held balance reads as conviction in every staking snapshot.',
  ],
  Bridge: [
    'Bridge {stake} to {chain} with the native bridge route, then bridge a smaller amount back a week later; completed round trips are the usage a bridge can verify.',
    'Repeat one bridge run every week for at least 6 weeks, varying the destination among the routes the bridge serves, and keep each run above the dust level ({roll} or more).',
    'Hold part of the bridged funds on the destination for a few days each time instead of returning instantly; dwell time separates farmers a bridge wants from pure volume bots.',
  ],
  Derivatives: [
    'Open a small perpetual position ({stake} of margin) on {chain} with a tight stop and close it the same day; margin posted and realised trades are the activity a perps venue records.',
    'Trade two or three sessions a week for at least 6 weeks, keeping each position small; consistent sessions beat one large trade in every perps points season so far.',
    'Post collateral and leave it idle in the account between sessions; idle margin still counts as committed capital on most perps leaderboards.',
  ],
  Yield: [
    'Deposit {stake} into the flagship vault on {chain} and leave it compounding; vault share balance over time is the record a yield protocol snapshots.',
    'Add a second, smaller deposit into a different vault the protocol runs, so the wallet shows breadth as well as depth.',
    'Keep both deposits for at least 10 weeks and claim or compound rewards weekly; early exits are what most vault seasons discount.',
  ],
};

function money(x: number): string {
  if (x >= 1_000_000) return `$${(x / 1_000_000).toFixed(1)}M`;
  if (x >= 1_000) return `$${(x / 1_000).toFixed(0)}k`;
  return `$${Math.round(x)}`;
}

/** Concrete, protocol-specific farm plan: category playbook first, generic cadence after. */
export function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const stake = p.tvl_usd >= 500_000_000 ? '$1,000-$2,500' : p.tvl_usd >= 50_000_000 ? '$500-$1,500' : '$250-$750';
  const roll = money(Math.max(50, Math.min(500, p.tvl_usd / 200_000)));
  const gas = chain === 'Ethereum' ? '$30-$60 of ETH' : `about $10 of the chain's gas token`;
  const fill = (s: string): string =>
    s
      .replaceAll('{chain}', chain)
      .replaceAll('{stake}', stake)
      .replaceAll('{roll}', roll)
      .replaceAll('{gas}', gas)
      .replaceAll('{category}', (p.category ?? 'core').toLowerCase());
  const playbook = (p.category !== null && CATEGORY_STEPS[p.category]) || [];
  const steps = [...playbook.map(fill), ...GENERIC_STEPS.map(fill)];
  // Keep 5 steps: the category playbook (3) plus the two most specific generic ones.
  const chosen = [...steps.slice(0, 3), steps[3]!, steps[4]!].filter(
    (s) => s.length >= 20 && s.length <= 600,
  );
  return chosen.slice(0, 5);
}

const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * A plausible launch candidate, by the watchlist's own hygiene: the snapshot records no
 * token for it (no market cap, no gecko id, no symbol), and it is not a wrapped, staked
 * or bridged product of a protocol whose token already trades, not an exchange's own
 * listing, and not a versioned re-deployment of a protocol that already launched.
 */
export function isCandidate(p: Protocol): boolean {
  if (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (/(^|\s)(V2|v2|2\.0)$/.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** Score every pre-token protocol and build the ranked board plus the dashboard's data. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const multiples = categoryMultiples(snapshot);
  const global = multiples.get('__global__')!;
  const watch = new Set(snapshot.watchlist);
  const scored: RadarRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isCandidate(p) && !watch.has(p.slug)) continue; // not a launch candidate
    const cat = multiples.get(p.category ?? 'Uncategorised') ?? global;
    const momentum = p.change_7d === null ? 1 : clamp(1 + (p.change_7d / 100) * 2, 0.6, 1.6);
    const age = ageDays(p.listed_at, snapshot.as_of);
    const maturity = age === null ? 1 : clamp(0.85 + Math.min(age, 1095) / 1095 * 0.35, 0.85, 1.2);
    const reach = 1 + Math.min(5, Math.max(0, p.chains.length - 1)) * 0.04;
    const implied = Math.max(1, Math.round(p.tvl_usd * cat.multiple * momentum * maturity * reach));
    scored.push({
      slug: p.slug,
      name: p.name,
      rank: 0,
      implied_value_usd: implied,
      farm_steps: farmSteps(p),
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      multiple: Math.round(cat.multiple * 100) / 100,
      momentum: Math.round(momentum * 100) / 100,
      maturity: Math.round(maturity * 100) / 100,
      reach: Math.round(reach * 100) / 100,
      watchlist: watch.has(p.slug),
    });
  }
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  // The board: every watchlist protocol, without exception, plus the strongest early
  // finds below the floor, capped at 260 rows so the page and the plan stay readable.
  const watched = scored.filter((r) => r.watchlist);
  const early = scored.filter((r) => !r.watchlist).slice(0, 260 - watched.length);
  const boardRows = [...watched, ...early].sort(
    (a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1),
  );
  boardRows.forEach((r, i) => {
    r.rank = i + 1;
    if (i > 0 && r.implied_value_usd >= boardRows[i - 1]!.implied_value_usd) {
      r.implied_value_usd = boardRows[i - 1]!.implied_value_usd - 1;
    }
  });
  const board: BoardRow[] = boardRows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));
  const live = snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 25)
    .map((p) => ({ slug: p.slug, name: p.name, symbol: p.symbol, mcap_usd: p.mcap_usd!, tvl_usd: p.tvl_usd }));
  const radar: Radar = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    rows: boardRows,
    live,
    multiples: [...multiples.entries()]
      .filter(([c]) => c !== '__global__')
      .map(([category, v]) => ({ category, multiple: Math.round(v.multiple * 100) / 100, peers: v.peers }))
      .sort((a, b) => b.peers - a.peers),
  };
  return { board, radar };
}

/** The gate's shape, checked before anything is written: a refusal here fails the run. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) if (!known.has(r.slug)) return `row ${r.slug} is not in the snapshot`;
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return `watchlist protocol ${slug} is missing`;
  let prev = Number.POSITIVE_INFINITY;
  const ranks = new Set<number>();
  for (const r of board) {
    if (ranks.has(r.rank)) return `rank ${r.rank} appears twice`;
    ranks.add(r.rank);
    if (r.implied_value_usd > prev) return `implied value rises at rank ${r.rank}`;
    if (r.implied_value_usd <= 0) return `rank ${r.rank} has no positive implied value`;
    prev = r.implied_value_usd;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} holds ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} holds a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The dashboard's data file: one assignment the page reads, nothing fetched. */
export function dataScript(radar: Radar): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}
