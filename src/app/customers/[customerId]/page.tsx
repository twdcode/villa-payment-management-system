import { CustomersPageClient } from "@/components/customers/customers-page-client";

export default async function CustomerProfilePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomersPageClient customerId={customerId} />;
}
