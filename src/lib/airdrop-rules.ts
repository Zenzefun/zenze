export const UNIT = 10n ** 18n;
export const DROP_POOL = 50_000_000n * UNIT;
/** A wallet must still hold this much $ZNZF to be in the split. */
export const MIN_HOLD = 10_000n * UNIT;

/** Points, not tokens. The pool is split by these weights when it opens. */
export const PARTS = {
  buy: 20,
  telegram: 5,
  x: 5,
  launch: 8,
  seen: 4,
  referral: 5,
  referralMax: 10,
} as const;

export const SPIN_SLICES = [
  { points: 5, weight: 50 },
  { points: 10, weight: 30 },
  { points: 20, weight: 15 },
  { points: 30, weight: 5 },
] as const;

export type SpinSlice = { points: number; weight: number };

export type DropRules = {
  buy: number;
  telegram: number;
  x: number;
  launch: number;
  seen: number;
  referral: number;
  referralMax: number;
  minHold: bigint;
  spin: SpinSlice[];
};

export function defaultDropRules(): DropRules {
  return {
    buy: PARTS.buy,
    telegram: PARTS.telegram,
    x: PARTS.x,
    launch: PARTS.launch,
    seen: PARTS.seen,
    referral: PARTS.referral,
    referralMax: PARTS.referralMax,
    minHold: MIN_HOLD,
    spin: SPIN_SLICES.map((slice) => ({ points: slice.points, weight: slice.weight })),
  };
}

function wholeTokens(value: number) {
  if (!Number.isFinite(value) || value < 0) return null;
  return BigInt(Math.floor(value)) * UNIT;
}

function pointsOf(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return null;
  return Math.floor(value);
}

export function rulesFromDesk(input: {
  buy: number;
  telegram: number;
  x: number;
  launch: number;
  seen: number;
  referral: number;
  referralMax: number;
  minHold: number;
  spin: SpinSlice[];
}): DropRules | null {
  const buy = pointsOf(input.buy);
  const telegram = pointsOf(input.telegram);
  const x = pointsOf(input.x);
  const launch = pointsOf(input.launch);
  const seen = pointsOf(input.seen);
  const referral = pointsOf(input.referral);
  const minHold = wholeTokens(input.minHold);
  if (buy == null || telegram == null || x == null || launch == null || seen == null || referral == null || minHold == null) {
    return null;
  }
  const referralMax = Math.floor(input.referralMax);
  if (!Number.isInteger(referralMax) || referralMax < 0 || referralMax > 100) return null;
  if (input.spin.length < 1 || input.spin.length > 4) return null;
  const weight = input.spin.reduce((sum, slice) => sum + slice.weight, 0);
  if (weight !== 100) return null;
  const spin: SpinSlice[] = [];
  for (const slice of input.spin) {
    const points = pointsOf(slice.points);
    if (points == null || !Number.isInteger(slice.weight) || slice.weight < 1) return null;
    spin.push({ points, weight: slice.weight });
  }
  return { buy, telegram, x, launch, seen, referral, referralMax, minHold, spin };
}

export function spinFromRoll(roll: number, slices: readonly SpinSlice[] = SPIN_SLICES) {
  const n = ((roll % 100) + 100) % 100;
  let cursor = 0;
  for (let i = 0; i < slices.length; i += 1) {
    cursor += slices[i].weight;
    if (n < cursor) return { index: i, points: slices[i].points };
  }
  return { index: 0, points: slices[0]?.points ?? 0 };
}

export function pointTotal(
  input: {
    bought: boolean;
    telegram: boolean;
    xFollow: boolean;
    launched: boolean;
    seen: boolean;
    referrals: number;
    spinPoints: number;
  },
  rules: DropRules = defaultDropRules(),
) {
  if (!input.bought) return 0;
  const friends = Math.max(0, Math.min(rules.referralMax, Math.floor(input.referrals)));
  const spinCap = rules.spin.reduce((max, slice) => (slice.points > max ? slice.points : max), 0);
  const spin = Math.max(0, Math.min(spinCap, Math.floor(input.spinPoints)));
  return (
    rules.buy +
    (input.telegram ? rules.telegram : 0) +
    (input.xFollow ? rules.x : 0) +
    (input.launched ? rules.launch : 0) +
    (input.seen ? rules.seen : 0) +
    rules.referral * friends +
    spin
  );
}

/** Floor split. Dust smaller than one point-share stays in the pool. */
export function shareWei(points: bigint, totalPoints: bigint, pool: bigint) {
  if (points <= 0n || totalPoints <= 0n || pool <= 0n) return 0n;
  if (points > totalPoints) return pool;
  return (pool * points) / totalPoints;
}

export function publicRules(rules: DropRules) {
  return {
    buy: rules.buy,
    telegram: rules.telegram,
    x: rules.x,
    launch: rules.launch,
    seen: rules.seen,
    referral: rules.referral,
    referralMax: rules.referralMax,
    minHold: Number(rules.minHold / UNIT),
    spin: rules.spin,
  };
}
