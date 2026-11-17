"use client";

import { useState } from "react";
import { ArrowUpRight, List } from "@phosphor-icons/react/dist/ssr";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/primitives";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mobile-nav">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open navigation">
            <List aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader className="px-6 pt-8">
            <SheetTitle className="wordmark">v3st.</SheetTitle>
            <SheetDescription>Explore the illustrative beta.</SheetDescription>
          </SheetHeader>
          <nav className="mobile-links" aria-label="Mobile navigation">
            {[
              ["How it works", "#how-it-works"],
              ["Explore a demo", "#demo"],
              ["FAQs", "#faq"],
            ].map(([label, href]) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>
                {label}
                <ArrowUpRight aria-hidden="true" />
              </a>
            ))}
          </nav>
          <SheetFooter className="gap-4 px-6 pb-10">
            <Badge variant="secondary">Beta · Test funds only</Badge>
            <p className="text-muted-foreground text-sm">
              An illustrative preview.
              <br />
              No account required.
            </p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
