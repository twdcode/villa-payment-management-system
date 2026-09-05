import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { getRepository } from "@/lib/repositories";

export default async function DashboardPage() {
  const database = await (await getRepository()).getDatabase();
  return <DashboardPageClient database={database} />;
}
