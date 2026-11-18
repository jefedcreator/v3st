import Link from "next/link";

import { Badge } from "@/primitives/badge";

import { HeaderCta } from "./header-cta";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";
import { PauseControl } from "./pause-control";
import { Wordmark } from "./wordmark";

export function SiteHeader(): React.JSX.Element {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/#top" className="header-logo" aria-label="V3ST — back to top">
          <Wordmark className="header-wordmark" />
          <Badge>Beta</Badge>
        </Link>
        <nav className="desktop-nav" aria-label="Sections">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="header-right">
          <HeaderCta />
          <PauseControl />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
