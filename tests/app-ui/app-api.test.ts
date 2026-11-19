import { describe, expect, it } from "vitest";

import { AppApiError, createAppApi } from "@/utils/app-api";

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | undefined;
};

function fakeApi(
  status: number,
  json: { status: number; message?: string; code?: string; data: unknown },
  options: { throwOnFetch?: boolean } = {},
) {
  const calls: Call[] = [];
  let signIns = 0;
  const api = createAppApi({
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: init?.body !== undefined ? String(init.body) : undefined,
      });
      if (options.throwOnFetch) throw new TypeError("dropped");
      return new Response(JSON.stringify(json), {
        status,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch,
    onSignInRequired: () => {
      signIns += 1;
    },
  });
  return { api, calls, signIns: () => signIns };
}

describe("the app API client", () => {
  it("unwraps data and sends the idempotency key", async () => {
    const { api, calls } = fakeApi(201, { status: 201, message: "Placed", data: { id: "o1" } });
    await expect(api.orders.place({ preview_id: "p1", pin: "1357" }, "key-1")).resolves.toEqual({
      id: "o1",
    });
    expect(calls[0]).toMatchObject({ url: "/api/v1/app/orders", method: "POST" });
    expect(calls[0]!.headers["idempotency-key"]).toBe("key-1");
  });

  it("throws the API's own copy", async () => {
    const { api } = fakeApi(409, {
      status: 409,
      message: "The price changed. Review the new price to continue.",
      code: "PRICE_CHANGED",
      data: null,
    });
    await expect(api.home.get()).rejects.toMatchObject({
      status: 409,
      code: "PRICE_CHANGED",
      message: "The price changed. Review the new price to continue.",
    });
  });

  it("redirects to sign-in on an ended session", async () => {
    const { api, signIns } = fakeApi(401, {
      status: 401,
      message: "Please sign in to continue.",
      code: "SIGN_IN_REQUIRED",
      data: null,
    });
    await expect(api.cash.get()).rejects.toBeInstanceOf(AppApiError);
    expect(signIns()).toBe(1);
  });

  it("falls back to generic copy for non-JSON failures and network errors", async () => {
    const html = createAppApi({
      fetch: (async () =>
        new Response("<html>bad gateway</html>", { status: 502 })) as unknown as typeof fetch,
      onSignInRequired: () => {},
    });
    await expect(html.home.get()).rejects.toMatchObject({
      status: 502,
      code: "SOMETHING_WENT_WRONG",
      message: "Something went wrong. Please try again.",
    });

    const dropped = fakeApi(0, { status: 0, data: null }, { throwOnFetch: true });
    await expect(dropped.api.home.get()).rejects.toMatchObject({
      code: "NETWORK",
      message: "You're offline or the connection dropped. Check it and try again.",
    });
  });

  it("builds query strings and bodies without empty keys", async () => {
    const { api, calls } = fakeApi(200, { status: 200, data: [] });
    await api.stocks.list({ q: "apple", watchlist: true });
    expect(calls[0]!.url).toBe("/api/v1/app/stocks?q=apple&watchlist=true");
    await api.stocks.list({});
    expect(calls[1]!.url).toBe("/api/v1/app/stocks");
    await api.earnings.setPreference({ choice: "payout", pin: "1357" });
    expect(calls[2]!.body).toBe('{"choice":"payout","pin":"1357"}');
    await api.beta.completeDeposit("d1");
    expect(calls[3]!.body).toBeUndefined();
    expect(calls[3]!.headers["content-type"]).toBeUndefined();
  });
});
