"use client";

import { useState } from "react";
import { List } from "@phosphor-icons/react/dist/ssr";
import { Button, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/primitives";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#explore", label: "Explore" },
  { href: "#ecosystem", label: "Provider ecosystem" },
  { href: "#demo", label: "Demo" },
  { href: "#friday", label: "Friday proceeds" },
  { href: "#faq", label: "FAQs" },
] as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className="grid size-11 cursor-pointer place-items-center rounded-full border border-rule bg-surface text-ink transition-colors hover:bg-sage focus-visible:ring-[3px] focus-visible:ring-ring/40 focus:outline-none"
          >
            <List className="size-5" weight="bold" />
          </button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>V3ST</SheetTitle>
            <SheetDescription>
              Beta · Test funds only. An illustrative preview; no account
              required.
            </SheetDescription>
          </SheetHeader>
          <nav aria-label="Mobile" className="px-6">
            <ul className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={close}
                    className="block rounded-full px-4 py-3 text-base font-medium text-ink transition-colors hover:bg-sage"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <SheetFooter>
            <Button asChild onClick={close}>
              <a href="#demo">Explore a demo</a>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
