import { expect, it } from "vitest";

import { CUSTOMER_DOCUMENTS } from "@/backend/content/documents";
import { parseDocument } from "@/components/landing/markdown-lite";

it("parses headings, paragraphs, lists and bold", () => {
  expect(parseDocument("# Privacy\n\nWe **never** sell it.\n\n- one\n- two")).toEqual([
    { kind: "heading", text: "Privacy" },
    {
      kind: "paragraph",
      inline: [
        { text: "We ", bold: false },
        { text: "never", bold: true },
        { text: " sell it.", bold: false },
      ],
    },
    { kind: "list", items: [[{ text: "one", bold: false }], [{ text: "two", bold: false }]] },
  ]);
});

it("parses every customer document with its title first", () => {
  for (const doc of Object.values(CUSTOMER_DOCUMENTS))
    expect(parseDocument(doc.body)[0]).toEqual({ kind: "heading", text: doc.title });
});
