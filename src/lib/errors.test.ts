import { describe, expect, it } from "vitest";

import { errorMessage, isSafeMessage } from "@/lib/errors";

const FALLBACK = "Unable to save the payment schedule.";

describe("errorMessage", () => {
  it("shows our own domain messages to the user", () => {
    // These are written for a person and must survive untouched.
    for (const message of [
      "Villa not found.",
      "This villa programme is cancelled and cannot be edited.",
      "A user with this email address already exists.",
      "Enter a payment amount greater than zero.",
      "Payment schedule total cannot exceed the villa value.",
      "Temporary password must contain at least 8 characters.",
    ]) {
      expect(errorMessage(new Error(message), FALLBACK)).toBe(message);
    }
  });

  it("hides the raw Postgres error the QA pass found on screen", () => {
    // Reported verbatim in the UI: schema, column list and live parameter values.
    const leaked = 'Failed query: insert into "payment_stages" ("id", "villa_id", "stage_name", "deliverables", "due_date", "principal_amount", "grace_period_days") values ($1, $2, $3, $4, $5, $6, $7) returning "id" params: 9336ac05-f491-45b4-8810-da10da8f50d7,1,Land Reservation,,1000000,13';
    expect(errorMessage(new Error(leaked), FALLBACK)).toBe(FALLBACK);
  });

  it("hides other driver and framework internals", () => {
    for (const message of [
      "Invalid time value",
      'duplicate key value violates unique constraint "villas_number_per_project"',
      'relation "payment_stages" does not exist',
      'column "villa_number" does not exist',
      "connect ECONNREFUSED 127.0.0.1:5432",
      "Error at /Users/someone/project/src/lib/repositories/supabase-repository.ts:851",
    ]) {
      expect(errorMessage(new Error(message), FALLBACK)).toBe(FALLBACK);
    }
  });

  it("falls back for non-Error values and empty messages", () => {
    expect(errorMessage("a string", FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(errorMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
  });

  it("treats an unusually long message as machine output", () => {
    expect(errorMessage(new Error("x".repeat(201)), FALLBACK)).toBe(FALLBACK);
    expect(isSafeMessage("x".repeat(200))).toBe(true);
  });
});
