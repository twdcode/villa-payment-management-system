/**
 * Wraps a user's search text as a `%…%` ILIKE pattern with the wildcards escaped.
 *
 * `%` and `_` are wildcards to ILIKE, and `\` is Postgres' default escape character.
 * Unescaped, a user typing "%" would match every row in the table, and "100%" would match
 * anything starting "100". Escaping makes those characters literal, so a search behaves the
 * way the person typing it expects.
 *
 * Lives outside the `"use server"` action file so it can be unit-tested directly — every
 * export from a server-action module has to be an async server action.
 */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
