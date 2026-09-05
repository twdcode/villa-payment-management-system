import { CustomersPageClient } from "@/components/customers/customers-page-client";
import { getRepository } from "@/lib/repositories";

export default async function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const database = await (await getRepository()).getDatabase();
  return <CustomersPageClient customerId={customerId} database={database} />;
}
