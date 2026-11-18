import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { expect, it } from "vitest";

import { BUILT_WITH } from "@/components/landing/brand-catalogue";

type ManifestEntry = {
  id: string;
  name: string;
  src: string;
  sourcePage: string;
  assetUrl: string;
  variant: string;
  treatment: string;
  width: number;
  height: number;
  contentType: string;
  sha256: string;
  retrievedOn: string;
  termsNote?: string;
  operatorAccepted?: string;
  betaStatus?: string;
};

const brandManifest = JSON.parse(
  readFileSync("public/brands/sources.json", "utf8"),
) as ManifestEntry[];
const stockManifest = JSON.parse(
  readFileSync("public/stocks/sources.json", "utf8"),
) as ManifestEntry[];

const allEntries = [...brandManifest, ...stockManifest];

function status(id: string): string | undefined {
  return brandManifest.find((e) => e.id === id)?.betaStatus;
}

function stockEntry(id: string): ManifestEntry {
  const entry = stockManifest.find((e) => e.id === id);
  if (!entry) throw new Error(`no stock manifest entry for ${id}`);
  return entry;
}

function shippedFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["public/brands", "public/stocks"]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name !== "sources.json") out.push(path.join(dir, name));
    }
  }
  return out.sort();
}

function entryFor(file: string): ManifestEntry {
  const entry = allEntries.find((e) => e.src === `/${file.replace(/^public\//, "")}`);
  if (!entry) throw new Error(`no manifest entry for ${file}`);
  return entry;
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function svgFiles(): string[] {
  return shippedFiles().filter((file) => file.endsWith(".svg"));
}

it("lists the 12 brands in the spec's order", () => {
  expect(BUILT_WITH.map((b) => b.id)).toEqual([
    "yellow-card", "paycrest", "privy", "coinbase", "base", "circle-usdc",
    "hydrex", "o1-exchange", "bankr", "stonks-exchange", "basestonk", "feel-cash",
  ]);
  expect(brandManifest.map((e) => e.id)).toEqual(BUILT_WITH.map((b) => b.id));
});

it("records each brand's real beta status", () => {
  expect(status("coinbase")).toBe("live-read");
  for (const id of ["yellow-card", "privy", "base", "hydrex"]) expect(status(id)).toBe("test-mode");
  for (const id of ["paycrest", "circle-usdc", "o1-exchange", "bankr", "stonks-exchange", "basestonk", "feel-cash"])
    expect(status(id)).toBe("simulated");
});

it("ships a mark for each of the eight profiled tickers", () => {
  expect(stockManifest.map((e) => e.id)).toEqual(["aapl", "nvda", "tsla", "msft", "amzn", "googl", "meta", "spcx"]);
});

it("has a manifest entry with a matching hash for every shipped file", () => {
  for (const file of shippedFiles()) {
    const entry = entryFor(file);
    expect(entry.sha256).toBe(sha256(file));
    expect(entry.width).toBeGreaterThan(0);
    expect(entry.height).toBeGreaterThan(0);
  }
});

it("contains no active or external content in any SVG", () => {
  for (const svg of svgFiles()) {
    const content = readFileSync(svg, "utf8");
    expect(content).not.toMatch(/<script|<foreignObject|\son[a-z]+\s*=|(xlink:)?href="https?:/i);
  }
});

it("records the operator's acceptance for restricted brands", () => {
  for (const id of ["aapl", "msft", "nvda"]) {
    expect(stockEntry(id).termsNote).toMatch(/\S/);
    expect(stockEntry(id).operatorAccepted).toBe("2026-11-18");
  }
});

it("no longer ships the Solana mark", () => {
  expect(existsSync("public/brands/solana.svg")).toBe(false);
});
