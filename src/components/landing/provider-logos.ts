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
    src: "/brands/yellow-card.png",
    width: 64,
    height: 64,
    sourceUrl: "https://yellowcard.io/press/",
    category: "provider",
  },
  {
    id: "paycrest",
    name: "Paycrest",
    src: "/brands/paycrest.png",
    width: 52,
    height: 56,
    sourceUrl: "https://www.paycrest.io/",
    category: "provider",
  },
  {
    id: "privy",
    name: "Privy",
    src: "/brands/privy.png",
    width: 64,
    height: 64,
    sourceUrl: "https://www.privy.io/brand-guidelines",
    category: "provider",
  },
  {
    id: "o1-exchange",
    name: "o1 Exchange",
    src: "/brands/o1-exchange.svg",
    width: 2400,
    height: 1000,
    sourceUrl: "https://o1.exchange/brand",
    category: "provider",
  },
  {
    id: "bankr",
    name: "Bankr",
    src: "/brands/bankr.svg",
    width: 150,
    height: 150,
    sourceUrl: "https://bankr.bot/",
    category: "provider",
  },
  {
    id: "hydrex",
    name: "Hydrex / Hydropump",
    src: "/brands/hydrex.png",
    width: 200,
    height: 200,
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
    sourceUrl: "https://feel.cash/",
    category: "provider",
  },
];

export const infrastructureLogos: readonly ProviderLogo[] = [
  {
    id: "base",
    name: "Base",
    src: "/brands/base-square.svg",
    width: 1280,
    height: 1280,
    sourceUrl: "https://brand.base.org/",
    category: "network",
  },
  {
    id: "solana",
    name: "Solana",
    src: "/brands/solana-mark.svg",
    width: 101,
    height: 88,
    sourceUrl: "https://solana.com/branding",
    category: "network",
  },
  {
    id: "usdc",
    name: "USDC",
    src: "/brands/usdc-token.svg",
    width: 96,
    height: 96,
    sourceUrl: "https://www.circle.com/pressroom#brandkit",
    category: "settlement",
  },
];
