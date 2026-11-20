"use client";

import Link from "next/link";

import { Button } from "@/primitives/button";

import { focusJoinAfterJump } from "./join-focus";

// The hero's pair of pills, in the katana.network pattern: a filled primary
// and an outlined secondary that fills with signal on hover. The hero holds no
// form. The primary jumps to the closing waitlist form and, with JavaScript,
// moves focus into its email field, exactly as the header button does.
export function HeroActions(): React.JSX.Element {
  return (
    <div className="hero-actions">
      <Button asChild size="lg" className="hero-action">
        <Link href="/#join" onClick={focusJoinAfterJump}>
          Join the waitlist
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline" className="hero-action hero-action-secondary">
        <Link href="/#how-it-works">How it works</Link>
      </Button>
    </div>
  );
}
