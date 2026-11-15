import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { HeroMotion } from "@/components/landing/hero-motion";
import { LandingMotion } from "@/components/landing/landing-motion";

export const dynamic = "error";

export default function MarketingPage() {
  return (
    <div id="top" data-landing-page className="min-h-dvh bg-canvas text-ink">
      <LandingMotion>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <Header />
        <main id="main-content">
          <HeroMotion>
            <Hero />
          </HeroMotion>
          <div className="landing-sections relative z-10 bg-canvas" />
        </main>
        <Footer />
      </LandingMotion>
    </div>
  );
}
