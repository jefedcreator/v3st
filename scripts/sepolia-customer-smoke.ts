import { randomUUID } from "node:crypto";

import { agreementService } from "../src/backend/services/agreements";
import { appCatalogService } from "../src/backend/services/app/catalog";
import { appCashService } from "../src/backend/services/app/cash";
import { appOrdersService, type AppOrderDto } from "../src/backend/services/app/orders";
import { findCustomerLeaks } from "../src/backend/services/app/vocabulary";
import { authService } from "../src/backend/services/auth";
import { CUSTOMER_DOCUMENTS, INVEST_DOCUMENTS } from "../src/backend/content/documents";
import { kycService } from "../src/backend/services/kyc";
import type { PrivyLogin } from "../src/backend/services/privy";
import { securityService } from "../src/backend/services/security";
import { walletService } from "../src/backend/services/wallets";

// Operator-only live check on Base Sepolia: signs a smoke customer in through
// Privy, funds cash, places one stock buy and prints the final order DTO after
// a customer-vocabulary leak check. Usage:
//   SEPOLIA_LIVE=1 APP_CUSTOMER_CHAIN=basesepolia yarn sepolia:customer-smoke
const EMAIL = "smoke@v3st.test";
const PIN = "1357";
const DEPOSIT_KOBO = 2_000_000n; // ₦20,000
const BUY_KOBO = 1_000_000n; // ₦10,000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  if (process.env.SEPOLIA_LIVE !== "1") {
    throw new Error("SEPOLIA_LIVE=1 is required; this script only runs against live Base Sepolia");
  }
  if (process.env.APP_CUSTOMER_CHAIN !== "basesepolia") {
    throw new Error("APP_CUSTOMER_CHAIN=basesepolia is required");
  }

  const login: PrivyLogin = {
    userId: `did:privy:smoke-${randomUUID()}`,
    sessionId: randomUUID(),
    issuedAt: new Date(),
    email: EMAIL,
  };
  const { user } = await authService.signInWithPrivy(login, "sepolia-customer-smoke");
  console.log(`signed in ${EMAIL} as ${user.id}`);
  await walletService.ensureUserWallets(user.id);
  await kycService.verify(user.id, { persona: "ada_tier2" });
  await securityService.setPin(user.id, PIN, null);
  await agreementService.accept(
    user.id,
    INVEST_DOCUMENTS.map((slug) => ({ slug, version: CUSTOMER_DOCUMENTS[slug].version })),
  );
  console.log("identity verified, PIN set, documents accepted");

  const { dto: deposit } = await appCashService.addMoney(
    user.id,
    DEPOSIT_KOBO,
    `smoke-deposit-${randomUUID()}`,
  );
  await appCashService.completeBetaDeposit(user.id, deposit.id);
  const fundDeadline = Date.now() + 180_000;
  for (;;) {
    const current = await appCashService.getDeposit(user.id, deposit.id);
    if (current.status === "completed") break;
    if (current.status === "failed" || current.status === "cancelled") {
      throw new Error(`deposit did not fund: ${current.status}`);
    }
    if (Date.now() > fundDeadline) throw new Error("timed out waiting for the deposit to fund");
    await sleep(2_000);
  }
  console.log("deposit funded");

  const stocks = await appCatalogService.list(user.id, {});
  const stock = stocks.find((s) => s.trading === "available");
  if (!stock) throw new Error("no available stock in the customer catalog");
  const preview = await appOrdersService.preview(user.id, {
    stock_id: stock.id,
    side: "buy",
    amount_kobo: BUY_KOBO,
  });
  const { dto: order } = await appOrdersService.place(
    user.id,
    { previewId: preview.preview_id, pin: PIN },
    `smoke-order-${randomUUID()}`,
  );
  console.log(`placed buy ${order.id} for ${stock.ticker}`);

  let final: AppOrderDto = order;
  const orderDeadline = Date.now() + 300_000;
  for (;;) {
    final = await appOrdersService.get(user.id, order.id);
    if (["completed", "failed", "cancelled", "expired"].includes(final.status)) break;
    if (Date.now() > orderDeadline) throw new Error("timed out waiting for the order to finalize");
    await sleep(3_000);
  }
  console.log(JSON.stringify(final, null, 2));

  const leaks = findCustomerLeaks(final);
  if (leaks.length > 0) {
    console.error(`customer vocabulary leaks: ${leaks.join(", ")}`);
    process.exit(1);
  }
  if (final.status !== "completed") {
    console.error(`order did not complete: ${final.status}`);
    process.exit(1);
  }
  console.log("smoke ok: order completed and the DTO is customer-safe");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
