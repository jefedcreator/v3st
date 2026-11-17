import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/primitives";
import { GrowthArtwork } from "./growth-artwork";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="closing-cta shell">
        <GrowthArtwork />
        <div className="relative">
          <h2>
            Make room for
            <br />a clearer picture.
          </h2>
          <p>Start with the examples. Take your time with the details.</p>
          <Button asChild size="lg">
            <a href="#demo">
              Explore a demo <ArrowRight aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
      <div className="footer-bottom shell">
        <div className="footer-wordmark" aria-label="V3ST">
          v3st<span aria-hidden="true">.</span>
        </div>
        <div className="footer-meta">
          <p>
            Beta · Test funds only.
            <br />
            An illustrative preview. No real investments.
          </p>
          <nav aria-label="Footer navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#demo">Explore a demo</a>
            <a href="#faq">FAQs</a>
            <a href="#top">
              Back to top <ArrowUpRight aria-hidden="true" />
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
