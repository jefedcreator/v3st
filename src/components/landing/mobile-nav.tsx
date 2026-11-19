"use client";

import { List } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Button } from "@/primitives/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/primitives/sheet";

import { focusJoinAfterJump } from "./join-focus";
import { NAV_LINKS } from "./nav-links";

// Below 768px the centred pill nav is replaced by a "Menu" button opening the
// left sheet: the five links, the waitlist pill and the beta line. Every link
// closes the sheet as it navigates, so the section it jumps to is not left
// under an open dialog. Without JavaScript the <noscript> list renders the
// same links instead.
export function MobileNav(): React.JSX.Element {
  return (
    <div className="mobile-nav">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" className="mobile-menu-trigger">
            <List aria-hidden="true" />
            Menu
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription className="sr-only">
              The page sections and the beta waitlist
            </SheetDescription>
          </SheetHeader>
          <nav className="mobile-links" aria-label="Sections">
            {NAV_LINKS.map((link) => (
              <SheetClose asChild key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </SheetClose>
            ))}
            <SheetClose asChild>
              <a href="/signin">Sign in</a>
            </SheetClose>
          </nav>
          <div className="mobile-sheet-footer">
            <SheetClose asChild>
              <Button asChild>
                <Link href="/#join" onClick={focusJoinAfterJump}>
                  Join the waitlist
                </Link>
              </Button>
            </SheetClose>
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
          <a href="/signin">Sign in</a>
        </nav>
      </noscript>
    </div>
  );
}
