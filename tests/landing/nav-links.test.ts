import { expect, it } from "vitest";

import { NAV_LINKS } from "@/components/landing/nav-links";

it("links the five sections in page order from any route", () => {
  expect(NAV_LINKS).toEqual([
    { label: "Stocks", href: "/#stocks" },
    { label: "Earn", href: "/#earn" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Safeguards", href: "/#safeguards" },
    { label: "FAQ", href: "/#faq" },
  ]);
});
