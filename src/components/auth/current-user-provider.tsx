"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { User } from "@/lib/domain/types";

/**
 * The signed-in user, shared with every client component.
 *
 * Replaces the hardcoded `"user-vishal"` lookups. Components must not search the user
 * list for who they are — that only worked because the answer was a constant.
 *
 * The value comes from the server, where the session was verified. Nothing here is
 * trusted for authorisation: server actions re-check on every call.
 */
const CurrentUserContext = createContext<User | null>(null);

export function CurrentUserProvider({ user, children }: { user: User | null; children: ReactNode }) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

/** The signed-in user, or null on a public page. */
export function useCurrentUser(): User | null {
  return useContext(CurrentUserContext);
}

/**
 * The signed-in user, guaranteed.
 *
 * For components that only ever render behind a route guard. Throws rather than
 * rendering something wrong if that assumption ever breaks.
 */
export function useRequiredUser(): User {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useRequiredUser used outside an authenticated route.");
  return user;
}
