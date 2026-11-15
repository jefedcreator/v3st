import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { Footer } from "@/components/landing/footer";
import { LandingMotion } from "@/components/landing/landing-motion";

import {
  ExploreStory,
  ProductStories,
} from "@/components/landing/product-stories";
import { ProviderEcosystem } from "@/components/landing/provider-ecosystem";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FridayProceeds } from "@/components/landing/friday-proceeds";
import { Faq } from "@/components/landing/faq";

export const dynamic = "error";

export default function MarketingPage() {
  return (
    <LandingMotion>
      <div id="top" />
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <div className="landing-content">
          <ExploreStory />
          <ProviderEcosystem />
          <HowItWorks />
          <ProductStories />
          <FridayProceeds />
          <Faq />
        </div>
      </main>
      <Footer />
    </LandingMotion>
  );
}
