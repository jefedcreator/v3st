export type ProviderLogo = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  sourceUrl: string;
  category: "provider" | "network" | "settlement";
};

export const providerLogos: readonly ProviderLogo[] = [
  {
    id: "yellow-card",
    name: "Yellow Card",
    src: "/brands/yellow-card.svg",
    width: 2977.0,
    height: 680.0,
    sourceUrl: "https://yellowcard.io/press/",
    category: "provider",
  },
  {
    id: "paycrest",
    name: "Paycrest",
    src: "/brands/paycrest.svg",
    width: 134.98,
    height: 28.0,
    sourceUrl: "https://www.paycrest.io/",
    category: "provider",
  },
  {
    id: "privy",
    name: "Privy",
    src: "/brands/privy.svg",
    width: 258.0,
    height: 78.0,
    sourceUrl: "https://www.privy.io/brand-guidelines",
    category: "provider",
  },
  {
    id: "o1-exchange",
    name: "o1 Exchange",
    src: "/brands/o1-exchange.svg",
    width: 2400.0,
    height: 1000.0,
    sourceUrl: "https://o1.exchange/brand",
    category: "provider",
  },
  {
    id: "bankr",
    name: "Bankr",
    src: "/brands/bankr.svg",
    width: 150.0,
    height: 150.0,
    sourceUrl: "https://bankr.bot/",
    category: "provider",
  },
  {
    id: "hydrex",
    name: "Hydrex / Hydropump",
    src: "/brands/hydrex.svg",
    width: 210.0,
    height: 65.0,
    sourceUrl: "https://www.hydrex.fi/",
    category: "provider",
  },
  {
    id: "stonks-exchange",
    name: "Stonks Exchange",
    src: "/brands/stonks-exchange.png",
    width: 128,
    height: 128,
    sourceUrl: "https://www.thestonks.exchange/",
    category: "provider",
  },
  {
    id: "basestonk",
    name: "BaseStonk",
    src: "/brands/basestonk.png",
    width: 256,
    height: 256,
    sourceUrl: "https://basestonk.io/",
    category: "provider",
  },
  {
    id: "feel-cash",
    name: "Feel.cash",
    src: "/brands/feel-cash.webp",
    width: 128,
    height: 128,
    sourceUrl: "https://feel.cash/launchpad",
    category: "provider",
  },
];
export const infrastructureLogos: readonly ProviderLogo[] = [
  {
    id: "base",
    name: "Base",
    src: "/brands/base.svg",
    width: 1280.0,
    height: 323.84,
    sourceUrl: "https://brand.base.org/",
    category: "network",
  },
  {
    id: "solana",
    name: "Solana",
    src: "/brands/solana.svg",
    width: 101.0,
    height: 88.0,
    sourceUrl: "https://solana.com/branding",
    category: "network",
  },
  {
    id: "usdc",
    name: "USDC",
    src: "/brands/usdc.svg",
    width: 1068.0,
    height: 309.0,
    sourceUrl: "https://www.circle.com/pressroom#brandkit",
    category: "settlement",
  },
];
