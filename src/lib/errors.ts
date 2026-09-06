/**
 * The message to show a user for a caught value.
 *
 * `catch` gives `unknown`, so every call site was unwrapping it by hand. The `fallback`
 * is what the user sees when the error carries nothing useful — keep it specific to the
 * action that failed ("Unable to save payment"), never generic.
 *
 * Messages that did not come from our own `throw new Error("...")` are replaced with the
 * fallback: a driver or framework error carries internals (table names, column lists,
 * parameter values, file paths) that must not be shown to a user. See `isSafeMessage`.
 */
export function errorMessage(reason: unknown, fallback: string): string {
  if (!(reason instanceof Error) || !reason.message) return fallback;
  return isSafeMessage(reason.message) ? reason.message : fallback;
}

/**
 * Patterns that mark a message as machine-generated rather than written for a user.
 *
 * Postgres errors reached the UI verbatim — one dialog rendered
 * `Failed query: insert into "payment_stages" ("id", "villa_id", ...) params: <uuid>,...`,
 * exposing the schema and live values. Rather than try to sanitise such a string, treat
 * any message carrying these signals as unsafe and show the caller's fallback instead.
 *
 * This is a denylist by necessity: the alternative — a dedicated error class on every
 * domain `throw` — is the better long-term shape, but it would need every `throw` in the
 * repository changed at once, and this stops the leak now without that risk.
 */
const UNSAFE_MESSAGE_PATTERNS: RegExp[] = [
  /failed query/i,
  /\bselect\b.+\bfrom\b/i,
  /\binsert into\b/i,
  /\bupdate\b.+\bset\b/i,
  /\bdelete from\b/i,
  /\bparams:/i,
  /\bconstraint\b/i,
  /duplicate key/i,
  /violates .*constraint/i,
  /\brelation\b .*does not exist/i,
  /\bcolumn\b .*does not exist/i,
  /invalid time value/i,
  /\bECONNREFUSED\b|\bETIMEDOUT\b|\bENOTFOUND\b/,
  /\bat least one of\b.*\bnode_modules\b/i,
  /node_modules/,
  /\/src\//,
  /\bpostgres\b/i,
  /\bdrizzle\b/i,
];

/** True when a message reads as something we deliberately wrote for a person. */
export function isSafeMessage(message: string): boolean {
  // A user-facing message is a sentence, not a query. Anything long is almost certainly
  // machine output — the longest deliberate message in the app is well under this.
  if (message.length > 200) return false;
  return !UNSAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}
