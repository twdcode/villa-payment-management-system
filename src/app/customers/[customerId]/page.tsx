import { CustomersPageClient } from "@/components/customers/customers-page-client";
import { getRepository } from "@/lib/repositories";

export default async function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const repository = await getRepository();
  // The full record (identity document, address) is fetched only for the profile actually
  // being viewed. `getDatabase()` carries `CustomerSummary`, so those fields never reach
  // pages that do not display them — see `CustomerSummary`.
  const [database, customer] = await Promise.all([repository.getDatabase(), repository.getCustomer(customerId)]);
  return <CustomersPageClient customer={customer} customerId={customerId} database={database} />;
}
