import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button } from "@/primitives";
import { MobileNav } from "./mobile-nav";

export function Header() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner shell">
          <a
            href="#top"
            className="wordmark header-logo"
            aria-label="V3ST home"
          >
            v3st<span aria-hidden="true">.</span>
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#demo">Explore</a>
            <a href="#faq">FAQs</a>
          </nav>
          <div className="header-cta">
            <Button asChild>
              <a href="#demo">
                Explore a demo <ArrowRight aria-hidden="true" />
              </a>
            </Button>
          </div>
          <MobileNav />
        </div>
      </header>
      <div className="beta-indicator">
        <Badge variant="secondary">Beta · Test funds only</Badge>
      </div>
      <noscript>
        <nav className="nojs-nav shell" aria-label="Mobile navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#demo">Explore demo</a>
          <a href="#faq">FAQs</a>
        </nav>
      </noscript>
    </>
  );
}
