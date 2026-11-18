import { WaitlistForm } from "./waitlist-form";

// The closing panel: converging light beams behind the headline and the join
// form.
export function JoinSection(): React.JSX.Element {
  return (
    <section id="join" className="landing-section join-section">
      <div className="shell">
        <div className="join-panel">
          <div className="join-art" aria-hidden="true">
            <picture>
              <source srcSet="/art/join-beams.avif" type="image/avif" />
              <source srcSet="/art/join-beams.webp" type="image/webp" />
              <img
                src="/art/join-beams.webp"
                alt=""
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
          <div className="join-content">
            <h2 className="type-display">Invest. Earn. Harvest.</h2>
            <p className="type-lead">Join the waitlist and we&apos;ll invite you to the beta.</p>
            <WaitlistForm source="join" inputId="join-email" />
          </div>
        </div>
      </div>
    </section>
  );
}
