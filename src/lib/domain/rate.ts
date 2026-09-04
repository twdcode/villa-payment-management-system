/**
 * Interest rates are stored as FRACTIONS everywhere: 0.015 means 1.5%.
 *
 * This is the financial-systems convention — rates enter arithmetic directly
 * (`principal × rate × days / divisor`) with no hidden division, so there is no
 * per-formula opportunity to forget a `/ 100`.
 *
 * Percent exists only at the edge, where a human reads or types a number. These two
 * functions are that edge. Converting inline in a component is how one screen ends up
 * 100x off from the rest.
 */

/** Stored fraction -> the number shown in a `%` field. `0.015` -> `1.5` */
export function rateToPercent(fraction: number): number {
  // Multiplying by 100 in binary floating point can leave dust (0.07 * 100 = 7.000000001).
  // Rates are quoted to at most 4 decimal places, so round there.
  return Math.round(fraction * 100 * 10_000) / 10_000;
}

/** What a human typed in a `%` field -> the fraction to store. `1.5` -> `0.015` */
export function percentToRate(percent: number): number {
  return Math.round((percent / 100) * 1_000_000) / 1_000_000;
}

/**
 * True if a stored value is a plausible fraction rather than a percent typed by mistake.
 *
 * Mirrors the database CHECK (`>= 0 AND < 1`). Having it here too means the form can
 * reject the value before a round trip, but the database stays the authority.
 */
export function isValidRateFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 1;
}
