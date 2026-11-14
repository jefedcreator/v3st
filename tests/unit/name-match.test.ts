import { describe, expect, it } from "vitest";

import { nameMatches } from "@/backend/services/compliance/name-match";

describe("nameMatches", () => {
  it("matches reordered and longer candidate names", () => {
    expect(nameMatches("ADAEZE OBI", "OBI ADAEZE CHIOMA")).toBe(true);
  });

  it("ignores case, punctuation and repeated spaces", () => {
    expect(nameMatches("Adaeze  Obi.", "ADAEZE OBI")).toBe(true);
  });

  it("rejects partial token matches", () => {
    expect(nameMatches("ADAEZE OBI", "ADA OBI")).toBe(false);
    expect(nameMatches("ADAEZE OBI", "CHINEDU EZE")).toBe(false);
  });

  it("requires at least two tokens on both sides", () => {
    expect(nameMatches("ADAEZE", "ADAEZE")).toBe(false);
  });

  it("treats tokens as a multiset", () => {
    expect(nameMatches("OBI OBI", "OBI ADAEZE")).toBe(false);
  });
});
