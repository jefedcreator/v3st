import { beforeEach, describe, expect, it } from "vitest";

import { GET as cashGET } from "@/app/api/v1/app/cash/route";
import { POST as depositsPOST } from "@/app/api/v1/app/cash/deposits/route";
import { GET as depositGET } from "@/app/api/v1/app/cash/deposits/[id]/route";
import { POST as betaCompletePOST } from "@/app/api/v1/app/beta/deposits/[id]/complete/route";
import { GET as banksGET } from "@/app/api/v1/app/banks/route";
import { GET as bankAccountGET, PUT as bankAccountPUT } from "@/app/api/v1/app/bank-account/route";
import { POST as withdrawalPreviewPOST } from "@/app/api/v1/app/withdrawals/preview/route";
import { POST as withdrawalsPOST } from "@/app/api/v1/app/withdrawals/route";
import { GET as withdrawalGET } from "@/app/api/v1/app/withdrawals/[id]/route";
import type {
  AppBankAccountDto,
  AppDepositDto,
  AppWithdrawalDto,
  AppWithdrawalPreviewDto,
} from "@/backend/services/app/cash";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { db } from "@/server/db";

import { callAppRoute, ORIGIN, readyCustomer, signInCustomer } from "../helpers/app";
import { useTestDatabase } from "../helpers/db";
import { seedTreasury } from "../helpers/factories";
import { ensureTestnetNetwork, testnet } from "../helpers/testnet";
import { setNow } from "../helpers/time";
import { drainJobs } from "../helpers/worker";

useTestDatabase();

beforeEach(async () => {
  setNow("2026-11-17T09:00:00Z");
  await ensureTestnetNetwork();
  await seedTreasury("testnet", 1_000_000_000_000n);
});

function dataOf<T>(json: unknown): T {
  return (json as { data: T }).data;
}

async function postDeposit(cookie: string, amountKobo: string, key: string) {
  return callAppRoute(depositsPOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/cash/deposits`,
    cookie,
    headers: { "idempotency-key": key },
    body: { amount_kobo: amountKobo },
  });
}

async function addMoneyAndComplete(cookie: string, amountKobo: string, key: string) {
  const res = await postDeposit(cookie, amountKobo, key);
  expect(res.status).toBe(201);
  const id = dataOf<AppDepositDto>(res.json).id;
  const complete = await callAppRoute(betaCompletePOST, {
    method: "POST",
    url: `${ORIGIN}/api/v1/app/beta/deposits/${id}/complete`,
    cookie,
    params: { id },
  });
  expect(complete.status).toBe(200);
  const handle = await testnet();
  for (let i = 0; i < 8; i += 1) {
    await drainJobs();
    await handle.mine(3);
  }
  return id;
}

describe("customer cash", () => {
  it("needs a verified identity before adding money", async () => {
    const { cookie } = await signInCustomer("fresh@v3st.test");
    const res = await postDeposit(cookie, "2000000", "cash-key-fresh-01");
    expect(res.status).toBe(409);
    expect((res.json as { code: string }).code).toBe("SETUP_REQUIRED");
  });

  it("adds money through bank transfer instructions and credits cash", async () => {
    const { cookie, userId } = await readyCustomer("cash1@v3st.test");
    const res = await postDeposit(cookie, "2000000", "cash-key-add-01");
    expect(res.status).toBe(201);
    const deposit = dataOf<AppDepositDto>(res.json);
    expect(deposit.status).toBe("waiting");
    expect(deposit.title).toBe("Waiting for your transfer");
    expect(deposit.amount_kobo).toBe("2000000");
    expect(deposit.reference).toMatch(/^V3-/);
    expect(deposit.pay_to).not.toBeNull();
    expect(deposit.pay_to!.amount_kobo).toBe("2000000");
    expect(deposit.pay_to!.account_number).toMatch(/^\d{10}$/);
    expect(deposit.pay_to!.bank_name).toBeTruthy();

    const replay = await postDeposit(cookie, "2000000", "cash-key-add-01");
    expect(replay.status).toBe(200);
    expect(dataOf<AppDepositDto>(replay.json).id).toBe(deposit.id);
    const reused = await postDeposit(cookie, "3000000", "cash-key-add-01");
    expect(reused.status).toBe(409);
    expect((reused.json as { code: string }).code).toBe("TRY_AGAIN");

    const depositId = await addMoneyAndComplete(cookie, "2000000", "cash-key-add-02");
    const done = await callAppRoute(depositGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/cash/deposits/${depositId}`,
      cookie,
      params: { id: depositId },
    });
    expect(dataOf<AppDepositDto>(done.json)).toMatchObject({
      status: "completed",
      title: "Money added",
    });

    const cash = await callAppRoute(cashGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/cash`,
      cookie,
    });
    const balance = dataOf<{
      available_kobo: string | null;
      on_hold_kobo: string | null;
      incoming_kobo: string | null;
      as_of: string;
    }>(cash.json);
    expect(BigInt(balance.available_kobo!)).toBeGreaterThan(0n);
    expect(balance.on_hold_kobo).not.toBeNull();
    expect(balance.incoming_kobo).not.toBeNull();
    expect(balance.as_of).toBeTruthy();
    expect(await ledgerService.balance(acct.userCash(userId, "testnet"))).toBeGreaterThan(0n);
  });

  it("previews and confirms a withdrawal with the PIN", async () => {
    const { cookie, userId } = await readyCustomer("cash2@v3st.test");
    await addMoneyAndComplete(cookie, "2000000", "cash-key-wd-dep-1");

    const preview = await callAppRoute(withdrawalPreviewPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/withdrawals/preview`,
      cookie,
      body: { amount_kobo: "500000" },
    });
    expect(preview.status).toBe(200);
    const p = dataOf<AppWithdrawalPreviewDto>(preview.json);
    expect(p.amount_kobo).toBe("500000");
    expect(p.fee_kobo).toBe("10000");
    expect(p.you_receive_kobo).toBe("490000");
    expect(p.to).toMatchObject({ account_ending: "6789", account_name: "ADAEZE OBI" });
    expect(p.expires_at).toBeTruthy();

    const wrong = await callAppRoute(withdrawalsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/withdrawals`,
      cookie,
      headers: { "idempotency-key": "cash-key-wd-01" },
      body: { preview_id: p.preview_id, pin: "9999" },
    });
    expect(wrong.status).toBe(422);
    expect((wrong.json as { code: string }).code).toBe("PIN_INCORRECT");
    expect(
      await db.rampOrder.count({
        where: { idempotencyKey: `withdrawal:${userId}:app-withdrawal:${userId}:cash-key-wd-01` },
      }),
    ).toBe(0);

    const confirmed = await callAppRoute(withdrawalsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/withdrawals`,
      cookie,
      headers: { "idempotency-key": "cash-key-wd-01" },
      body: { preview_id: p.preview_id, pin: "1357" },
    });
    expect(confirmed.status).toBe(201);
    const withdrawal = dataOf<AppWithdrawalDto>(confirmed.json);
    expect(withdrawal.status).toBe("processing");
    expect(withdrawal.title).toBe("Sending to your bank");
    expect(withdrawal.fee_kobo).toBe("10000");
    expect(withdrawal.you_receive_kobo).toBe("490000");
    expect(withdrawal.to.account_ending).toBe("6789");

    // Replaying the same key with a wrong PIN returns the stored withdrawal
    // without running the PIN check again.
    const replay = await callAppRoute(withdrawalsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/withdrawals`,
      cookie,
      headers: { "idempotency-key": "cash-key-wd-01" },
      body: { preview_id: p.preview_id, pin: "9999" },
    });
    expect(replay.status).toBe(200);
    expect(dataOf<AppWithdrawalDto>(replay.json).id).toBe(withdrawal.id);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.pinFailedAttempts).toBe(0);

    // The same key with a different preview is a conflict.
    const preview2 = await callAppRoute(withdrawalPreviewPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/withdrawals/preview`,
      cookie,
      body: { amount_kobo: "100000" },
    });
    const reused = await callAppRoute(withdrawalsPOST, {
      method: "POST",
      url: `${ORIGIN}/api/v1/app/withdrawals`,
      cookie,
      headers: { "idempotency-key": "cash-key-wd-01" },
      body: {
        preview_id: dataOf<AppWithdrawalPreviewDto>(preview2.json).preview_id,
        pin: "1357",
      },
    });
    expect(reused.status).toBe(409);
    expect((reused.json as { code: string }).code).toBe("TRY_AGAIN");

    const fetched = await callAppRoute(withdrawalGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/withdrawals/${withdrawal.id}`,
      cookie,
      params: { id: withdrawal.id },
    });
    expect(dataOf<AppWithdrawalDto>(fetched.json)).toMatchObject({
      id: withdrawal.id,
      reference: withdrawal.reference,
    });
  });

  it("refuses a bank account in someone else's name and lists banks", async () => {
    const { cookie } = await readyCustomer("cash3@v3st.test");
    const banks = await callAppRoute(banksGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/banks`,
      cookie,
    });
    expect(banks.status).toBe(200);
    const list = dataOf<{ code: string; name: string }[]>(banks.json);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ code: "sim-bank-a" });

    const res = await callAppRoute(bankAccountPUT, {
      method: "PUT",
      url: `${ORIGIN}/api/v1/app/bank-account`,
      cookie,
      body: { bank_code: "sim-bank-a", account_number: "0345678912", pin: "1357" },
    });
    expect(res.status).toBe(422);
    expect((res.json as { code: string }).code).toBe("NAME_MISMATCH");

    const active = await callAppRoute(bankAccountGET, {
      method: "GET",
      url: `${ORIGIN}/api/v1/app/bank-account`,
      cookie,
    });
    expect(dataOf<AppBankAccountDto>(active.json)).toMatchObject({
      bank_name: "Beta Test Bank A (simulated)",
      account_ending: "6789",
      account_name: "ADAEZE OBI",
    });
  });
});
