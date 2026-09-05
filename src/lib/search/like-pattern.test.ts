import { describe, expect, it } from "vitest";

import { likePattern } from "@/lib/search/like-pattern";

describe("likePattern", () => {
  it("wraps ordinary text in wildcards", () => {
    expect(likePattern("nimal")).toBe("%nimal%");
  });

  it("escapes the ILIKE wildcards so they match literally", () => {
    // Unescaped, "%" alone would match every row in the table.
    expect(likePattern("%")).toBe("%\\%%");
    expect(likePattern("100%")).toBe("%100\\%%");
    // "_" matches any single character unless escaped.
    expect(likePattern("a_b")).toBe("%a\\_b%");
  });

  it("escapes the escape character itself", () => {
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("leaves characters that are not wildcards alone", () => {
    expect(likePattern("O'Brien & Co.")).toBe("%O'Brien & Co.%");
    expect(likePattern("villa 01")).toBe("%villa 01%");
  });
});
