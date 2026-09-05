import { CustomersPageClient } from "@/components/customers/customers-page-client";
import { getRepository } from "@/lib/repositories";

export default async function CustomersPage() {
  const database = await (await getRepository()).getDatabase();
  return <CustomersPageClient database={database} />;
}
