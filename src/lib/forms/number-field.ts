import { z } from "zod";

/**
 * A numeric form field that accepts the raw string a text input produces.
 *
 * `z.coerce.number()` alone is unsafe for these forms: it turns `""` into `0`, so clearing
 * a box and saving would quietly write a zero the user never typed. Here an empty or
 * non-numeric value becomes `NaN`, which fails every downstream check and surfaces the
 * `required` message instead.
 *
 * Accepts `number` as well so a form that still holds numbers keeps type-checking.
 */
export function numberField(options: { required: string; integer?: boolean; min?: number; minMessage?: string; max?: number; maxMessage?: string }) {
  let schema = z
    .union([z.number(), z.string()])
    .transform((value) => (typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value)))
    .refine((value) => Number.isFinite(value), options.required);

  if (options.integer) schema = schema.refine((value) => Number.isInteger(value), options.required);
  if (options.min !== undefined) schema = schema.refine((value) => value >= options.min!, options.minMessage ?? options.required);
  if (options.max !== undefined) schema = schema.refine((value) => value <= options.max!, options.maxMessage ?? options.required);

  return schema;
}
