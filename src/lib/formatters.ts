export function formatLkr(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(value);
}

const UNITS: Array<[divisor: number, label: string]> = [
  [1_000_000_000, "B"],
  [1_000_000, "M"],
  [1_000, "K"],
];

/**
 * `LKR 2.5M` style, for dashboard cards where a full number would wrap.
 *
 * Deliberately not `Intl.NumberFormat({ notation: "compact" })`: ICU decides for itself
 * whether a rounded value needs its trailing `.0` printed, and that decision differs
 * between Node's bundled ICU (server rendering) and the browser's (client re-render) —
 * `5000000` came out as `LKR 5M` on the server and `LKR 5.0M` in Chrome, a real mismatch
 * that made React discard and re-render the whole dashboard on every load. Scaling and
 * rounding the number ourselves removes the ambiguity: the same JS produces the same
 * digits everywhere `Intl` runs.
 *
 * Matched against `Intl`'s own compact output across every multiple of 977 from 1,000
 * to 5,000,000,000 (a deliberately awkward step so roundoffs land on odd values, not just
 * round thousands): the unit is picked from the raw magnitude, then a value that rounds
 * to exactly 1000 of that unit (999,950-999,999) is bumped up one, same as `Intl` does.
 */
export function formatLkrCompact(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  const unitIndex = UNITS.findIndex(([divisor]) => abs >= divisor);
  if (unitIndex === -1) {
    return `${sign}LKR ${new Intl.NumberFormat("en-LK", { maximumFractionDigits: 1 }).format(abs)}`;
  }

  const [divisor, label] = UNITS[unitIndex];
  const rounded = Math.round((abs / divisor) * 10) / 10;
  // 999,950 rounds to "1000.0" of its unit — bump to the next one up, as Intl does.
  const bumped = unitIndex > 0 && rounded >= 1000;
  const [finalDivisor, finalLabel] = bumped ? UNITS[unitIndex - 1] : [divisor, label];

  const number = new Intl.NumberFormat("en-LK", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(abs / finalDivisor);
  return `${sign}LKR ${number}${finalLabel}`;
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
/**
 * Western grouping (million/thousand) — matches the M/K/B units `formatLkrCompact` already
 * uses. No "hundred" entry: `threeDigitsToWords` already spells hundreds for any remainder
 * under 1000, so giving "hundred" its own scale would split e.g. 123 into two separate
 * words ("one hundred" + "twenty-three") and lose the "and" that joins them.
 */
const SCALES: Array<[divisor: number, label: string]> = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

function threeDigitsToWords(value: number): string {
  if (value < 20) return ONES[value];
  if (value < 100) return TENS[Math.floor(value / 10)] + (value % 10 ? `-${ONES[value % 10]}` : "");
  return `${ONES[Math.floor(value / 100)]} hundred${value % 100 ? ` and ${threeDigitsToWords(value % 100)}` : ""}`;
}

/**
 * Spells out a whole-rupee amount ("two million two thousand" style, but in the
 * lakh/crore grouping used for LKR) so a string of digits and its zero count can be
 * double-checked at a glance — the motivating case is telling 2,000,000 apart from
 * 200,000 without recounting zeros.
 */
export function numberToWordsLkr(value: number): string {
  const rounded = Math.round(Math.abs(value));
  if (rounded === 0) return "zero rupees";

  let remainder = rounded;
  const parts: string[] = [];
  for (const [divisor, label] of SCALES) {
    const count = Math.floor(remainder / divisor);
    if (count > 0) {
      parts.push(`${threeDigitsToWords(count)} ${label}`);
      remainder %= divisor;
    }
  }
  if (remainder > 0) parts.push(threeDigitsToWords(remainder));

  const sign = value < 0 ? "minus " : "";
  return `${sign}${parts.join(" ")} rupee${rounded === 1 ? "" : "s"}`;
}
