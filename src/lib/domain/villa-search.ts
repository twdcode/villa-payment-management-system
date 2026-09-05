/**
 * Villa numbers are stored bare — "01", or "B12" — and every screen renders them with the
 * word "Villa" in front. Searching only the stored value therefore missed the label the
 * user is actually reading: typing "villa 01", or just "v", found nothing on a list plainly
 * showing "Villa 01".
 *
 * `villaSearchText` builds the string the user believes they are searching: the displayed
 * label, the bare number, and the customer name when one is assigned.
 */
export function villaSearchText(villaNumber: string, customerName?: string | null): string {
  const bare = villaNumber.replace(/^[A-Z]+-/, "");
  return [`villa ${bare}`, villaNumber, bare, customerName ?? ""].join(" ").toLocaleLowerCase();
}

/**
 * True when every whitespace-separated term appears somewhere in the villa's search text.
 *
 * Term-wise rather than substring so word order and extra spaces do not matter — "01 villa"
 * and "villa  01" both match "Villa 01" — and so a customer name can be combined with a
 * villa number in one query.
 */
export function matchesVillaSearch(query: string, villaNumber: string, customerName?: string | null): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = villaSearchText(villaNumber, customerName);
  return terms.every((term) => haystack.includes(term));
}
