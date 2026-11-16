import { Badge, Button } from "@/primitives";
import { MobileNav } from "./mobile-nav";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#demo", label: "Explore" },
  { href: "#faq", label: "FAQs" },
] as const;

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div
        data-nav-shell
        className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-4"
      >
        <a
          href="#top"
          data-nav-logo
          className="text-2xl font-bold tracking-tight text-primary"
          aria-label="V3ST — back to top"
        >
          V3ST
        </a>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-sage"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Beta · Test funds only
          </Badge>
          <span className="hidden overflow-hidden md:block">
            <Button asChild size="sm" data-header-cta>
              <a href="#demo">Explore a demo</a>
            </Button>
          </span>
          <MobileNav />
        </div>
      </div>
      <noscript>
        <nav
          aria-label="Primary without JavaScript"
          className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-6 pb-3 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full border border-rule bg-surface px-4 py-2 text-sm font-medium text-ink"
            >
              {link.label}
            </a>
          ))}
          <a
            href="#demo"
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Explore a demo
          </a>
        </nav>
      </noscript>
    </header>
  );
}
