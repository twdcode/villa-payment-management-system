import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";
import { getDataSource, getRepository } from "@/lib/repositories";

export default async function DashboardPage() {
  const initialData = getDataSource() === "supabase" ? await (await getRepository()).getDatabase() : undefined;
  return <DashboardPageClient initialData={initialData} />;
}
