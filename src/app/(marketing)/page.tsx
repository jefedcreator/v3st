import { BuiltWith } from "@/components/landing/built-with";
import { EarnSection } from "@/components/landing/earn-section";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { JoinSection } from "@/components/landing/join-section";
import { Safeguards } from "@/components/landing/safeguards";
import { StocksSection } from "@/components/landing/stocks-section";
import { getLandingTicker, profileOnlyTicker } from "@/server/landing";

export const revalidate = 300;

export default async function MarketingPage() {
  const ticker = (await getLandingTicker()) ?? profileOnlyTicker();
  return (
    <>
      <Hero />
      <div className="landing-after-hero">
        <StocksSection ticker={ticker} />
        <BuiltWith />
        <EarnSection />
        <HowItWorks />
        <Safeguards />
        <Faq />
        <JoinSection />
      </div>
    </>
  );
}
