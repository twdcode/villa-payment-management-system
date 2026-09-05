import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

/**
 * Sends one approved reminder.
 *
 * STUB — no Resend account exists yet. This logs the attempt, writes a `reminder_logs`
 * row and marks the request delivered, so the approval queue's send/review flow works
 * end to end against real data. Swap the body for a real `resend.emails.send(...)` call
 * once `RESEND_API_KEY` and a verified sending domain are configured; nothing else in the
 * call chain (Server Actions, the cron route, `reviewReminderApproval`) needs to change —
 * they all go through this one function.
 *
 * O7: `Reply-To` is the workspace's configured mailbox (`app_settings.reply_to_email`),
 * never hardcoded, so a customer hitting reply reaches a person. `From` will be the
 * verified Resend sending domain once real sending is wired up.
 */
export async function sendReminderEmail(request: {
  id: string;
  customerId: string;
  paymentStageId: string | null;
  templateId: string | null;
  subject: string;
  message: string;
}): Promise<void> {
  const [customer] = await db.select({ email: schema.customers.email }).from(schema.customers).where(eq(schema.customers.id, request.customerId));
  const [settings] = await db.select({ replyTo: schema.appSettings.replyToEmail }).from(schema.appSettings);

  // Throw, never return quietly. The cron route marks a request `sent` (with `sentAt`)
  // as soon as this resolves — returning here would stamp a request that was never
  // delivered as sent, and count it as a success in the run summary. Its own catch
  // records the failure, so throwing is what puts the row in the right state.
  if (!customer?.email) {
    throw new Error("Customer has no email address on file.");
  }

  // TODO(Phase 8 / real Resend account): replace this block with
  //   await resend.emails.send({ from: <verified domain>, to: customer.email,
  //     reply_to: settings.replyTo ?? undefined, subject: request.subject, html: request.message });
  // and use its response id as providerMessageId instead of the placeholder below.
  console.warn(
    `[reminders] STUB SEND — no Resend account configured. Would email ${customer.email} ` +
      `(reply-to: ${settings?.replyTo ?? "not set"}): "${request.subject}"`,
  );
  const providerMessageId = `stub-${request.id}`;

  await db.insert(schema.reminderLogs).values({
    reminderRequestId: request.id,
    templateId: request.templateId,
    paymentStageId: request.paymentStageId,
    customerId: request.customerId,
    deliveryStatus: "delivered",
    providerMessageId,
  });

  await db.update(schema.reminderRequests).set({ deliveryStatus: "delivered" }).where(eq(schema.reminderRequests.id, request.id));
}
