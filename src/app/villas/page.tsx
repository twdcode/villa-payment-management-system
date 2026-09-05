import { VillasPageClient } from "@/components/villas/villas-page-client";
import { getRepository } from "@/lib/repositories";

export default async function VillasPage() {
  const database = await (await getRepository()).getDatabase();
  return <VillasPageClient database={database} />;
}
