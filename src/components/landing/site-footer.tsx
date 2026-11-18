import Link from "next/link";

import { NAV_LINKS } from "./nav-links";
import { Wordmark } from "./wordmark";

const LEARN_LINKS: readonly { label: string; href: string }[] = [
  { label: "Risks of investing", href: "/legal/risks" },
  { label: "How your shares are held", href: "/legal/how-shares-are-held" },
  { label: "Earn risks", href: "/legal/earn-risks" },
];

const LEGAL_LINKS: readonly { label: string; href: string }[] = [
  { label: "Terms of use", href: "/legal/terms" },
  { label: "Privacy", href: "/legal/privacy" },
];

export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-columns">
          <nav aria-label="V3ST">
            <h2 className="footer-heading">V3ST</h2>
            <ul>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Learn">
            <h2 className="footer-heading">Learn</h2>
            <ul>
              {LEARN_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Legal">
            <h2 className="footer-heading">Legal</h2>
            <ul>
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="footer-disclosure">
          V3ST is in beta. Everything uses test money: no real naira moves and shares have no cash
          value. Shares track the price of the real company and are not direct ownership. Investing
          can lose money.
        </p>
        <p className="footer-affiliation">
          Company names and logos identify the companies whose prices the beta shares track and the
          services V3ST is built to work with. V3ST isn&apos;t affiliated with or endorsed by them.
        </p>
        <div className="footer-wordmark-wrap" aria-hidden="true">
          <div className="footer-glow">
            <picture>
              <source srcSet="/art/footer-glow.avif" type="image/avif" />
              <source srcSet="/art/footer-glow.webp" type="image/webp" />
              <img
                src="/art/footer-glow.webp"
                alt=""
                width={1600}
                height={600}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <Wordmark className="footer-wordmark" />
        </div>
        <p className="footer-copy">© 2026 V3ST</p>
      </div>
    </footer>
  );
}
