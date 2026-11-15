import Image from "next/image";
import {
  providerLogos,
  infrastructureLogos,
  type ProviderLogo,
} from "./provider-logos";
const symbolOnly = new Set([
  "bankr",
  "stonks-exchange",
  "basestonk",
  "feel-cash",
  "solana",
]);
function Mark({ logo }: { logo: ProviderLogo }) {
  return (
    <div className={`ecosystem-mark ecosystem-${logo.id}`}>
      <Image
        src={logo.src}
        alt={`${logo.name} logo`}
        width={logo.width}
        height={logo.height}
        className="brand-image"
      />
      {symbolOnly.has(logo.id) && <span>{logo.name}</span>}
    </div>
  );
}
export function ProviderEcosystem() {
  return (
    <section
      id="ecosystem"
      className="section ecosystem-section shell"
      aria-labelledby="ecosystem-title"
    >
      <h2 id="ecosystem-title">Provider ecosystem</h2>
      <div className="provider-marks">
        {providerLogos.map((logo) => (
          <Mark key={logo.id} logo={logo} />
        ))}
      </div>
      <div
        className="infrastructure-marks"
        aria-label="Network and settlement context"
      >
        {infrastructureLogos.map((logo) => (
          <Mark key={logo.id} logo={logo} />
        ))}
      </div>
      <p className="ecosystem-caption">
        Integrations are simulated in this beta. Provider names identify the
        documented ecosystem; they do not imply endorsement.
      </p>
    </section>
  );
}
