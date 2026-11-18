"use client";

import { Button } from "@/primitives/button";

// The header's "Join the waitlist" pill. It appears as the hero hands over
// (driven by --header-cta), links to #join, and with JavaScript moves focus
// into that form's email field after the jump. Never a modal.
export function HeaderCta(): React.JSX.Element {
  const handleClick = () => {
    window.setTimeout(() => {
      if (window.location.hash === "#join") {
        document.getElementById("join-email")?.focus({ preventScroll: true });
      }
    }, 0);
  };
  return (
    <Button asChild>
      <a href="/#join" data-header-cta className="header-cta" onClick={handleClick}>
        Join the waitlist
      </a>
    </Button>
  );
}
