import { test as base, expect } from "@playwright/test";

/**
 * Every test context rejects and records attempted API, third-party and
 * socket access. Allowed: same-origin GET/HEAD for the page paths
 * (/, /legal/*, /waitlist), the Next static/image assets, /brands/*,
 * /stocks/*, /art/*, /icon.svg and the social image — plus same-origin GET
 * fetches carrying the RSC header to those page paths (client-side
 * navigation). Everything else, including POST /api/v1/waitlist, is a
 * recorded violation and is aborted; waitlist tests intercept it with
 * page-level page.route, which runs before this context guard.
 */
const ORIGIN = "http://127.0.0.1:3107";
const PAGE_PATH = /^\/(?:legal\/[^/]+|waitlist)?$/;
const ASSET_PATH =
  /^\/(?:_next\/(?:static\/.+|image)|brands\/.+|stocks\/.+|art\/.+|icon\.svg|opengraph-image\.png)$/;

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ context }, use) => {
      const violations: string[] = [],
        errors: string[] = [],
        writes: string[] = [];
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        const request = route.request();
        const method = request.method();
        const resourceType = request.resourceType();
        const isPageFetch =
          (resourceType === "fetch" || resourceType === "xhr") &&
          Boolean(request.headers()["rsc"]);
        const allowed =
          url.origin === ORIGIN &&
          ["GET", "HEAD"].includes(method) &&
          (ASSET_PATH.test(url.pathname) ||
            (PAGE_PATH.test(url.pathname) &&
              (isPageFetch || !["fetch", "xhr", "websocket"].includes(resourceType))));
        if (!allowed) {
          violations.push(method + " " + url.toString());
          return route.abort();
        }
        return route.continue();
      });
      await context.routeWebSocket("**/*", async (socket) => {
        violations.push("WebSocket " + socket.url());
        await socket.close();
      });
      await context.exposeBinding(
        "__reportLandingWrite",
        (_source, value: string) => {
          writes.push(value);
        },
      );
      await context.addInitScript(() => {
        const report = (value: string) => {
          void (
            window as unknown as {
              __reportLandingWrite: (value: string) => Promise<void>;
            }
          ).__reportLandingWrite(value);
        };
        const write = Object.getOwnPropertyDescriptor(
          Storage.prototype,
          "setItem",
        )!.value as (this: Storage, key: string, value: string) => void;
        Storage.prototype.setItem = function (key: string, value: string) {
          report("storage:" + key);
          return write.call(this, key, value);
        };
        const cookie = Object.getOwnPropertyDescriptor(
          Document.prototype,
          "cookie",
        );
        if (cookie?.set && cookie.get) {
          const setter = cookie.set.bind(document),
            getter = cookie.get.bind(document);
          Object.defineProperty(document, "cookie", {
            get: () => getter() as string,
            set: (value: string) => {
              report("cookie");
              setter(value);
            },
          });
        }
      });
      context.on("page", (page) => {
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error") errors.push(message.text());
        });
      });
      await use();
      expect(violations, "No forbidden runtime network attempts").toEqual([]);
      expect(errors, "No page, hydration or console errors").toEqual([]);
      expect(await context.cookies(), "No session cookies").toEqual([]);
      expect(
        writes,
        "No browser persistence writes, including before reload",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };
