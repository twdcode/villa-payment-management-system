import { VillasPageClient } from "@/components/villas/villas-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function VillasPage() {
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <VillasPageClient initialData={initialData} />;
}
