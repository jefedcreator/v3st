"use client";

import Link from "next/link";

import { Button } from "@/primitives/button";

// The header's "Join the waitlist" pill. It appears as the hero hands over
// (driven by --header-cta), links to #join, and with JavaScript moves focus
// into that form's email field after the jump. Never a modal.
export function HeaderCta(): React.JSX.Element {
  const handleClick = () => {
    const startedAt = performance.now();
    const focusJoin = () => {
      if (window.location.hash === "#join") {
        document.getElementById("join-email")?.focus({ preventScroll: true });
        return;
      }
      if (performance.now() - startedAt < 1000) window.setTimeout(focusJoin, 50);
    };
    window.setTimeout(focusJoin, 0);
  };
  return (
    <Button asChild>
      <Link href="/#join" data-header-cta className="header-cta" onClick={handleClick}>
        Join the waitlist
      </Link>
    </Button>
  );
}
