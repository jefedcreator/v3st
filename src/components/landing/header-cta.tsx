"use client";

import Link from "next/link";

import { Button } from "@/primitives/button";

import { focusJoinAfterJump } from "./join-focus";

// The header's "Join the waitlist" pill. It appears as the hero hands over
// (driven by --header-cta), links to #join, and with JavaScript moves focus
// into that form's email field after the jump. Never a modal.
export function HeaderCta(): React.JSX.Element {
  return (
    <Button asChild>
      <Link href="/#join" data-header-cta className="header-cta" onClick={focusJoinAfterJump}>
        Join the waitlist
      </Link>
    </Button>
  );
}
