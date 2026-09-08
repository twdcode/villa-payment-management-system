/**
 * How a villa is named on screen and in customer emails.
 *
 * `villa_number` is free text and doubles as the villa's NAME — the PRD calls the field
 * "Villa number/name", and the setup form invites either. So the stored value is shown as
 * written: `12`, `MB-04` and `Sunset Villa` are all valid and all display verbatim.
 *
 * Every screen used to render `number.replace(/^[A-Z]+-/, "Villa ")`, which threw away any
 * `LETTERS-` prefix. That was safe only while numbers were bare, and villa numbers are
 * unique PER PROJECT — so `MB-01` (Marina Bay) and `HC-01` (Hillcrest) are both legal, and
 * both displayed as "Villa 01". Two different villas, two different customers, one label:
 * exactly the ambiguity a prefix exists to prevent.
 *
 * The word "Villa" is still prepended, but only when the value does not already read as a
 * name — a purely numeric `12` becomes `Villa 12`, while `Sunset Villa` and `MB-04` are
 * left alone rather than becoming "Villa Sunset Villa".
 */
export function villaLabel(villaNumber: string | null | undefined): string {
  const value = villaNumber?.trim() ?? "";
  // Callers commonly hold an optional villa (`villa?.number`) because the row's villa may
  // have been removed; accepting that here keeps a `?? "Unknown villa"` dance out of every
  // call site.
  if (!value) return "Villa";
  return /^\d+$/.test(value) ? `Villa ${value}` : value;
}

/**
 * The villa's label plus its project, for lists that mix projects together.
 *
 * Uniqueness is per project, so a number alone can be genuinely ambiguous across the
 * workspace; where both are shown the pair is always unambiguous.
 */
export function villaLabelWithProject(villaNumber: string, projectName?: string | null): string {
  return projectName ? `${villaLabel(villaNumber)} · ${projectName}` : villaLabel(villaNumber);
}
