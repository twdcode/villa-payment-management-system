"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/guard";
import { getRepository } from "@/lib/repositories";
import type { User } from "@/lib/domain/types";
import type { UserInput, UserUpdate } from "@/lib/repositories/contracts";

/** Only `super_admin` holds `manage_users` — see `lib/permissions/roles.ts`. */
export async function createUserAction(input: UserInput): Promise<User> {
  await requirePermission("manage_users");
  const user = await (await getRepository()).createUser(input);
  revalidatePath("/settings");
  return user;
}

export async function updateUserAction(id: string, input: UserUpdate): Promise<User> {
  await requirePermission("manage_users");
  const user = await (await getRepository()).updateUser(id, input);
  revalidatePath("/settings");
  return user;
}

export async function setUserActiveAction(id: string, isActive: boolean): Promise<User> {
  await requirePermission("manage_users");
  const user = await (await getRepository()).setUserActive(id, isActive);
  revalidatePath("/settings");
  return user;
}

export async function deleteUserAction(id: string): Promise<void> {
  await requirePermission("manage_users");
  await (await getRepository()).deleteUser(id);
  revalidatePath("/settings");
}
