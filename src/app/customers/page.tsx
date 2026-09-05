import { CustomersPageClient } from "@/components/customers/customers-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function CustomersPage() {
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <CustomersPageClient initialData={initialData} />;
}
