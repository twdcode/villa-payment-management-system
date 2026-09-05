import "server-only";

import { eq } from "drizzle-orm";
import { Resend } from "resend";

import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

/**
 * `CONTACT_FROM_EMAIL` is deliberately not a workspace setting like `replyToEmail` — the
 * `From` address is tied to whichever domain is actually verified in Resend, an
 * infrastructure fact, not a business preference. Sandbox accounts have no verified
 * domain of their own and must send from `onboarding@resend.dev`, which itself only
 * delivers to the Resend account's own address — real customers cannot receive email
 * until a real domain is added and verified in the Resend dashboard.
 */
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Sends one approved reminder through Resend.
 *
 * Writes a `reminder_logs` row and marks the request delivered on success. Nothing else
 * in the call chain (Server Actions, the cron route, `reviewReminderApproval`) needs to
 * change to reach this — they always went through this one function.
 *
 * O7: `Reply-To` is the workspace's configured mailbox (`app_settings.reply_to_email`),
 * never hardcoded, so a customer hitting reply reaches a person.
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

  if (!resend || !process.env.CONTACT_FROM_EMAIL) {
    throw new Error("Email sending is not configured (RESEND_API_KEY / CONTACT_FROM_EMAIL missing).");
  }

  const { data, error } = await resend.emails.send({
    from: process.env.CONTACT_FROM_EMAIL,
    to: customer.email,
    replyTo: settings?.replyTo ?? undefined,
    subject: request.subject,
    html: request.message,
  });

  // Resend reports failures as a returned `error`, not a thrown exception — surface it
  // the same way a network failure would be, so the caller's catch block behaves
  // identically either way.
  if (error) {
    throw new Error(`Resend rejected the send: ${error.message}`);
  }

  await db.insert(schema.reminderLogs).values({
    reminderRequestId: request.id,
    templateId: request.templateId,
    paymentStageId: request.paymentStageId,
    customerId: request.customerId,
    deliveryStatus: "delivered",
    providerMessageId: data?.id ?? null,
  });

  await db.update(schema.reminderRequests).set({ deliveryStatus: "delivered" }).where(eq(schema.reminderRequests.id, request.id));
}
