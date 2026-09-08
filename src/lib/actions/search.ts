"use server";

import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { requireUser } from "@/lib/auth/guard";
import { db } from "@/lib/db/client";
import { customers, projects, villas } from "@/lib/db/schema";
import { villaStatusLabels } from "@/lib/domain/status-labels";
import { villaLabel } from "@/lib/domain/villa-label";
import { can } from "@/lib/permissions/roles";
import { likePattern } from "@/lib/search/like-pattern";

/** One row in the palette. `href` is where selecting it navigates. */
export type SearchResult = {
  id: string;
  kind: "project" | "villa" | "customer";
  title: string;
  subtitle: string;
  href: string;
};

/** Per group, so one crowded type cannot push the others off the list. */
const PER_GROUP_LIMIT = 5;

/**
 * Workspace-wide search across projects, villas and customers.
 *
 * Receipts are deliberately NOT here. A receipt number identifies one payment, and the
 * place to act on a payment is the Collections table — which searches receipt and
 * reference numbers itself, alongside its own filters. Returning receipts here sent the
 * user to a villa profile instead, which is not where the receipt is.
 *
 * Runs on the server rather than filtering a client-side copy of the workspace on purpose:
 * the result set is the only thing that reaches the browser, and the permission checks
 * below decide what a role is allowed to see. Filtering in the client would mean shipping
 * every customer's email and phone to every signed-in user regardless of role.
 *
 * Villas are matched on the label the user actually reads. `villa_number` is stored bare
 * ("01"), while every screen renders "Villa 01", so the pattern is also tested against
 * 'villa ' || villa_number — otherwise typing "villa 01" finds nothing. Same rule as
 * `matchesVillaSearch` on the villa list pages.
 */
export async function globalSearchAction(rawQuery: string): Promise<SearchResult[]> {
  const user = await requireUser();
  const query = rawQuery.trim();
  // One character matches most of the workspace and is never a real search.
  if (query.length < 2) return [];

  const pattern = likePattern(query);
  const results: SearchResult[] = [];

  const [projectRows, villaRows, customerRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, location: projects.location })
      .from(projects)
      .where(and(isNull(projects.deletedAt), or(ilike(projects.name, pattern), ilike(projects.location, pattern))))
      .limit(PER_GROUP_LIMIT),

    db
      .select({ id: villas.id, projectId: villas.projectId, villaNumber: villas.villaNumber, villaType: villas.villaType, saleStatus: villas.saleStatus, projectName: projects.name })
      .from(villas)
      .innerJoin(projects, eq(projects.id, villas.projectId))
      .where(and(
        isNull(villas.deletedAt),
        or(
          ilike(villas.villaNumber, pattern),
          // The rendered label, so "villa 01" and "v" behave as the user expects.
          sql`('villa ' || ${villas.villaNumber}) ilike ${pattern}`,
          ilike(villas.villaType, pattern),
        ),
      ))
      .limit(PER_GROUP_LIMIT),

    // Contact details are readable by any signed-in role today; `manage_customers` gates
    // editing, not viewing. Kept as an explicit check so tightening it later is one line.
    can(user.role, "view_workspace")
      ? db
        .select({ id: customers.id, fullName: customers.fullName, email: customers.email, phone: customers.phone })
        .from(customers)
        .where(and(
          isNull(customers.deletedAt),
          or(ilike(customers.fullName, pattern), ilike(customers.email, pattern), ilike(customers.phone, pattern), ilike(customers.nicPassport, pattern)),
        ))
        .limit(PER_GROUP_LIMIT)
      : Promise.resolve([]),
  ]);

  for (const project of projectRows) {
    results.push({ id: project.id, kind: "project", title: project.name, subtitle: project.location ?? "Project", href: `/projects/${project.id}` });
  }
  for (const villa of villaRows) {
    results.push({
      id: villa.id,
      kind: "villa",
      title: villaLabel(villa.villaNumber),
      // The label, not the raw enum: the palette should read "Available", not "available".
      subtitle: [villa.projectName, villa.villaType, villaStatusLabels[villa.saleStatus]].filter(Boolean).join(" · "),
      href: `/projects/${villa.projectId}/villas/${villa.id}`,
    });
  }
  for (const customer of customerRows) {
    results.push({ id: customer.id, kind: "customer", title: customer.fullName, subtitle: [customer.email, customer.phone].filter(Boolean).join(" · ") || "Customer", href: `/customers/${customer.id}` });
  }
  return results;
}
