export type BetaStatus = "live-read" | "test-mode" | "simulated";
export type LogoTreatment = "official-light" | "filtered-white" | "unaltered";

export type BuiltWithBrand = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  symbolOnly: boolean;
  treatment: LogoTreatment;
  betaStatus: BetaStatus;
};

// The 12 services V3ST is built to work with, in the order the page shows them.
// Mirrors public/brands/sources.json (same ids, order, dimensions, treatment and
// beta status); tests/landing/brand-assets.test.ts keeps the two in step.
export const BUILT_WITH: readonly BuiltWithBrand[] = [
  {
    id: "yellow-card",
    name: "Yellow Card",
    src: "/brands/yellow-card.svg",
    width: 2977,
    height: 680,
    symbolOnly: false,
    treatment: "official-light",
    betaStatus: "test-mode",
  },
  {
    id: "paycrest",
    name: "Paycrest",
    src: "/brands/paycrest.svg",
    width: 135,
    height: 28,
    symbolOnly: false,
    treatment: "filtered-white",
    betaStatus: "simulated",
  },
  {
    id: "privy",
    name: "Privy",
    src: "/brands/privy.svg",
    width: 219,
    height: 24,
    symbolOnly: false,
    treatment: "filtered-white",
    betaStatus: "test-mode",
  },
  {
    id: "coinbase",
    name: "Coinbase",
    src: "/brands/coinbase.svg",
    width: 1102,
    height: 197,
    symbolOnly: false,
    treatment: "unaltered",
    betaStatus: "live-read",
  },
  {
    id: "base",
    name: "Base",
    src: "/brands/base.svg",
    width: 1280,
    height: 324,
    symbolOnly: false,
    treatment: "official-light",
    betaStatus: "test-mode",
  },
  {
    id: "circle-usdc",
    name: "Circle (USDC)",
    src: "/brands/circle-usdc.svg",
    width: 1068,
    height: 309,
    symbolOnly: false,
    treatment: "official-light",
    betaStatus: "simulated",
  },
  {
    id: "hydrex",
    name: "Hydrex",
    src: "/brands/hydrex.svg",
    width: 210,
    height: 65,
    symbolOnly: false,
    treatment: "official-light",
    betaStatus: "test-mode",
  },
  {
    id: "o1-exchange",
    name: "o1 Exchange",
    src: "/brands/o1-exchange.svg",
    width: 2400,
    height: 1000,
    symbolOnly: false,
    treatment: "official-light",
    betaStatus: "simulated",
  },
  {
    id: "bankr",
    name: "Bankr",
    src: "/brands/bankr.svg",
    width: 150,
    height: 150,
    symbolOnly: true,
    treatment: "unaltered",
    betaStatus: "simulated",
  },
  {
    id: "stonks-exchange",
    name: "Stonks Exchange",
    src: "/brands/stonks-exchange.png",
    width: 128,
    height: 128,
    symbolOnly: true,
    treatment: "unaltered",
    betaStatus: "simulated",
  },
  {
    id: "basestonk",
    name: "BaseStonk",
    src: "/brands/basestonk.png",
    width: 256,
    height: 256,
    symbolOnly: true,
    treatment: "unaltered",
    betaStatus: "simulated",
  },
  {
    id: "feel-cash",
    name: "Feel.cash",
    src: "/brands/feel-cash.svg",
    width: 145,
    height: 225,
    symbolOnly: true,
    treatment: "unaltered",
    betaStatus: "simulated",
  },
];
