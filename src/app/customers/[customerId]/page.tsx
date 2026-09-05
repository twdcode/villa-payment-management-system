import { CustomersPageClient } from "@/components/customers/customers-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <CustomersPageClient customerId={customerId} initialData={initialData} />;
}
