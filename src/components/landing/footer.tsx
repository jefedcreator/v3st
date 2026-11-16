import { Button } from "@/primitives";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { GrowthArtwork } from "./growth-artwork";

const FOOTER_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#explore", label: "Explore" },
  { href: "#ecosystem", label: "Provider ecosystem" },
  { href: "#demo", label: "Demo" },
  { href: "#friday", label: "Friday proceeds" },
  { href: "#faq", label: "FAQs" },
] as const;

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-rule bg-canvas">
      <GrowthArtwork
        className="pointer-events-none absolute inset-0 opacity-70"
      />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-10 px-6 py-20 text-center md:py-28">
        <h2 className="max-w-2xl text-4xl font-bold tracking-tight text-balance text-ink md:text-5xl">
          See what naira-funded investing looks like.
        </h2>
        <Button asChild size="lg">
          <a href="#demo">
            Explore a demo
            <ArrowRight className="size-4" weight="bold" />
          </a>
        </Button>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm font-medium text-ink-muted transition-colors hover:text-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-sm text-ink-muted">
          V3ST is in beta. Test funds only — no real money, no live providers,
          and nothing here is an offer or financial advice.
        </p>
        <p
          aria-hidden="true"
          className="text-[clamp(4rem,18vw,14rem)] leading-none font-bold tracking-[-0.04em] text-primary/15 select-none"
        >
          V3ST
        </p>
      </div>
    </footer>
  );
}
