import { formatLkr } from "@/lib/formatters";

/**
 * The customer-facing fields a reminder template may interpolate.
 *
 * Kept as one map rather than positional arguments so a new token is added in exactly one
 * place and every call site picks it up.
 */
export type ReminderTokenValues = {
  amount: number;
  companyName: string;
  customerName: string;
  dueDate: string;
  villaName: string;
};

/**
 * Both brace styles and both historical field names are accepted on purpose.
 *
 * The templates panel writes `{customer_name}`, but earlier templates (and the seed
 * fixtures) use `{{customer_name}}`, and the same value has been spelled both
 * `villa_name`/`villa_number` and `outstanding_amount`/`amount` at different times.
 * Rendering has to cope with every template already stored in the database, so aliases
 * resolve to the same value rather than being migrated — a migration would rewrite
 * message text a Super Admin wrote, which is theirs, not ours.
 */
const aliases = (values: ReminderTokenValues): Array<[string, string]> => [
  ["customer_name", values.customerName],
  ["villa_name", values.villaName],
  ["villa_number", values.villaName],
  ["outstanding_amount", formatLkr(values.amount)],
  ["amount", formatLkr(values.amount)],
  ["due_date", values.dueDate],
  ["company_name", values.companyName],
];

/**
 * Replaces every known token in `value`.
 *
 * Unknown tokens are deliberately left as-is: silently blanking `{whatver}` would hide a
 * typo in a template, whereas leaving it visible in the approval queue lets the reviewer
 * catch it before the customer does.
 */
export function renderReminderText(value: string, values: ReminderTokenValues): string {
  return aliases(values).reduce(
    (text, [token, replacement]) => text.replaceAll(`{{${token}}}`, replacement).replaceAll(`{${token}}`, replacement),
    value,
  );
}
