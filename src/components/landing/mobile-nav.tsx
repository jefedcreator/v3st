"use client";

import { List } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Button } from "@/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/primitives/sheet";

import { NAV_LINKS } from "./nav-links";

// Below 768px the centred pill nav is replaced by a Menu button opening the
// left sheet: the five links, the waitlist pill and the beta line. Without
// JavaScript the <noscript> list renders the same links instead.
export function MobileNav(): React.JSX.Element {
  return (
    <div className="mobile-nav">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Open menu">
            <List aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" aria-label="Menu">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription className="sr-only">
              The page sections and the beta waitlist
            </SheetDescription>
          </SheetHeader>
          <nav className="mobile-links" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mobile-sheet-footer">
            <Button asChild>
              <Link href="/#join">Join the waitlist</Link>
            </Button>
            <p className="mobile-beta-line">Beta · test money only</p>
          </div>
        </SheetContent>
      </Sheet>
      <noscript>
        <nav className="nojs-nav" aria-label="Sections">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link href="/#join">Join the waitlist</Link>
        </nav>
      </noscript>
    </div>
  );
}
