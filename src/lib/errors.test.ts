import { describe, expect, it } from "vitest";

import { errorMessage } from "@/lib/errors";

describe("errorMessage", () => {
  it("prefers the error's own message", () => {
    expect(errorMessage(new Error("Villa is cancelled."), "Unable to save.")).toBe("Villa is cancelled.");
  });

  it("falls back for a thrown value that is not an Error", () => {
    expect(errorMessage("boom", "Unable to save.")).toBe("Unable to save.");
    expect(errorMessage(undefined, "Unable to save.")).toBe("Unable to save.");
  });

  it("falls back for an Error with an empty message, so the user never sees a blank alert", () => {
    expect(errorMessage(new Error(""), "Unable to save.")).toBe("Unable to save.");
  });
});
