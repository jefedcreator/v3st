import {
  infrastructureLogos,
  providerLogos,
  type ProviderLogo,
} from "./provider-logos";

function LogoItem({ logo, height }: { logo: ProviderLogo; height: number }) {
  const isWide = logo.width / logo.height > 2.5;
  return (
    <li className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={logo.name}
        width={isWide ? Math.round(height * (logo.width / logo.height)) : height}
        height={height}
        loading="lazy"
        className="h-6 w-auto shrink-0 md:h-8"
      />
      {isWide ? (
        <span className="sr-only">{logo.name}</span>
      ) : (
        <span className="text-sm font-medium whitespace-nowrap text-ink">
          {logo.name}
        </span>
      )}
    </li>
  );
}

export function ProviderEcosystem() {
  return (
    <section
      id="ecosystem"
      aria-labelledby="ecosystem-heading"
      className="mx-auto max-w-[1200px] px-6 py-14 md:py-28"
    >
      <div className="text-center">
        <h2
          id="ecosystem-heading"
          className="text-3xl font-bold tracking-tight text-balance text-ink md:text-5xl"
        >
          Provider ecosystem
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-ink-muted">
          Integrations are simulated in this beta. Provider names identify the
          documented ecosystem; they do not imply endorsement.
        </p>
      </div>
      <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-10 gap-y-8 md:gap-x-14">
        {providerLogos.map((logo) => (
          <LogoItem key={logo.id} logo={logo} height={32} />
        ))}
      </ul>
      <div className="mt-14 border-t border-rule pt-10">
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-8 md:gap-x-14">
          {infrastructureLogos.map((logo) => (
            <LogoItem key={logo.id} logo={logo} height={32} />
          ))}
        </ul>
      </div>
    </section>
  );
}
