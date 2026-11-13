import { NextRequest } from "next/server";

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export async function callRoute(
  handler: RouteHandler,
  opts: {
    method: string;
    url: string;
    body?: unknown;
    headers?: Record<string, string>;
    cookie?: string;
    params?: Record<string, string>;
  },
): Promise<{ status: number; json: unknown; headers: Headers }> {
  const url = new URL(opts.url, "http://localhost:3000");
  const headers = new Headers(opts.headers ?? {});
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (typeof opts.body === "string" || opts.body instanceof Uint8Array) {
      body = opts.body as BodyInit;
    } else {
      body = JSON.stringify(opts.body);
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }
  if (opts.cookie !== undefined && !headers.has("cookie")) {
    headers.set("cookie", opts.cookie);
  }
  const req = new NextRequest(url, { method: opts.method, headers, body });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? {}) });
  const json = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, json, headers: res.headers };
}
