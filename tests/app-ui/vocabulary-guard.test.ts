import { describe, expect, it } from "vitest";

import { findCustomerLeaks } from "@/backend/services/app/vocabulary";
import { APP_SOURCE_DIRS, collectCopy } from "./app-copy";

describe("the app's vocabulary", () => {
  it("keeps crypto vocabulary out of the app's own copy", () => {
    const leaks: string[] = [];
    const copy = collectCopy(APP_SOURCE_DIRS);
    for (const value of copy) {
      // No `documents` option: only legal documents may say "tokenized", and
      // they are rendered from the API, not from this source.
      leaks.push(...findCustomerLeaks(value).map((leak) => `${value}: ${leak}`));
    }
    expect(leaks).toEqual([]);
  });

  it("checks real copy", () => {
    expect(collectCopy(APP_SOURCE_DIRS)).toContain("Add money to get started.");
  });
});
