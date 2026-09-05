"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { Customer } from "@/lib/domain/types";
import type { CustomerInput, CustomerUpdate } from "@/lib/repositories/contracts";

export async function createCustomerAction(input: CustomerInput): Promise<Customer> {
  await requirePermission("manage_customers");
  const customer = await (await getRepository()).createCustomer(input);
  revalidatePath("/customers");
  return customer;
}

export async function updateCustomerAction(id: string, input: CustomerUpdate): Promise<Customer> {
  await requirePermission("manage_customers");
  const customer = await (await getRepository()).updateCustomer(id, input);
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return customer;
}

export async function addCustomerNoteAction(customerId: string, content: string): Promise<void> {
  await requirePermission("add_notes");
  await (await getRepository()).addCustomerNote(customerId, content);
  revalidatePath(`/customers/${customerId}`);
}
