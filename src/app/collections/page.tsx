import { CollectionsPageClient } from "@/components/collections/collections-page-client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions/roles";
import { getRepository } from "@/lib/repositories";

export default async function CollectionsPage() {
  const repository = await getRepository();

  // Queue on load rather than from a nightly cron. `queue_due_reminders()` is idempotent
  // and compares dates with `>=`, so opening the page catches up on every trigger crossed
  // since it was last opened — a schedule bought nothing here, because queuing only
  // creates rows awaiting approval and nobody sees them until someone looks.
  //
  // Gated on `send_reminders` so a View Only user browsing Collections does not silently
  // create workspace records. Failures are swallowed on purpose: a queueing problem must
  // not take down the payments table, which is what people actually came here for.
  const user = await getSessionUser();
  if (user && can(user.role, "send_reminders")) {
    try {
      await repository.queueDueReminders();
    } catch (error) {
      console.error("[collections] reminder queueing failed:", error);
    }
  }

  const database = await repository.getDatabase();
  return <CollectionsPageClient database={database} />;
}
