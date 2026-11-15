import { test as base, expect } from "@playwright/test";
/** Every test context rejects and records attempted API, third-party and socket access. */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ context }, use) => {
      const violations: string[] = [],
        errors: string[] = [],
        writes: string[] = [];
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        const request = route.request();
        const staticPath =
          url.pathname === "/" ||
          /^\/(?:_next\/(?:static\/|image$)|brands\/|icon\.svg$|opengraph-image\.png$)/.test(
            url.pathname,
          );
        if (
          url.origin !== "http://127.0.0.1:3107" ||
          !staticPath ||
          !["GET", "HEAD"].includes(request.method()) ||
          ["fetch", "xhr", "websocket"].includes(request.resourceType())
        ) {
          violations.push(route.request().method() + " " + url.toString());
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
