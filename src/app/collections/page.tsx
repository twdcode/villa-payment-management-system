import { CollectionsPageClient } from "@/components/collections/collections-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

/**
 * Server Component: fetches on the server when Supabase is configured, so the client
 * bundle never needs `getRepository()` — see `lib/repositories/client.ts` for why that
 * matters. In mock mode `initialData` stays undefined and the client component fetches
 * exactly as it did before Phase 4.
 */
export default async function CollectionsPage() {
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <CollectionsPageClient initialData={initialData} />;
}
