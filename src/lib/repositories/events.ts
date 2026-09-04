/**
 * Dispatched on `window` after any repository write, so open views can refresh.
 * Implementation-agnostic: the localStorage repository fires it directly, and the
 * Supabase one will fire it after a successful server action.
 */
export const DATABASE_UPDATED_EVENT = "juniper:database-updated";
