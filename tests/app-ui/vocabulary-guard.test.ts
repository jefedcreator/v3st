import { describe, expect, it } from "vitest";

import { findCustomerLeaks } from "@/backend/services/app/vocabulary";
import { APP_SOURCE_DIRS, collectCopy } from "./app-copy";

describe("the app's vocabulary", () => {
  it("keeps crypto vocabulary out of the app's own copy", () => {
    const leaks: string[] = [];
    const copy = collectCopy(APP_SOURCE_DIRS);
    for (const value of copy) {
      leaks.push(...findCustomerLeaks(value, { documents: true }));
    }
    expect(leaks).toEqual([]);
  });

  it("checks real copy", () => {
    expect(collectCopy(APP_SOURCE_DIRS)).toContain("Add money to get started.");
  });
});
