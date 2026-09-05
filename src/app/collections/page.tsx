import { CollectionsPageClient } from "@/components/collections/collections-page-client";
import { getRepository } from "@/lib/repositories";

export default async function CollectionsPage() {
  const database = await (await getRepository()).getDatabase();
  return <CollectionsPageClient database={database} />;
}
