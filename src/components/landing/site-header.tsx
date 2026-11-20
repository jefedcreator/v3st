import Link from "next/link";

import { ProductLogo } from "@/components/product-logo";
import { Badge } from "@/primitives/badge";

import { HeaderCta } from "./header-cta";
import { MobileNav } from "./mobile-nav";
import { NAV_LINKS } from "./nav-links";

export function SiteHeader(): React.JSX.Element {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/#top" className="header-logo" aria-label="V3ST — back to top">
          <ProductLogo className="header-mark" decorative />
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
          <a className="header-signin" href="/signin">
            Sign in
          </a>
          <HeaderCta />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
