import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Footer } from "@/components/landing/footer";
import { LandingMotion } from "@/components/landing/landing-motion";

export const dynamic = "error";

export default function MarketingPage() {
  return (
    <LandingMotion>
      <div id="top" />
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <div className="landing-content" />
      </main>
      <Footer />
    </LandingMotion>
  );
}
