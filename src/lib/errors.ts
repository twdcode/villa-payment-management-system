/**
 * The message to show a user for a caught value.
 *
 * `catch` gives `unknown`, so every call site was unwrapping it by hand. The `fallback`
 * is what the user sees when the error carries nothing useful — keep it specific to the
 * action that failed ("Unable to save payment"), never generic.
 */
export function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
