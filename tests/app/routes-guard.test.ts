import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.join(process.cwd(), "src");
const APP_ROUTES_DIR = path.join(SRC, "app/api/v1/app");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full));
    } else if (entry === "route.ts") {
      out.push(full);
    }
  }
  return out.sort();
}

function resolveImport(spec: string): string {
  const rel = spec.replace(/^@\//, "");
  return path.join(SRC, rel.endsWith(".ts") ? rel : `${rel}.ts`);
}

// Extracts the body of `async name(...)` from a service class source by brace counting.
function methodBody(source: string, name: string): string {
  const start = source.search(new RegExp(`\\basync ${name}\\s*\\(`));
  if (start === -1) return "";
  const braceStart = source.indexOf("{", start);
  if (braceStart === -1) return "";
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return "";
}

describe("customer route guards", () => {
  const files = routeFiles(APP_ROUTES_DIR);

  it("finds the customer route tree", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("every /api/v1/app route runs with the customer audience", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("withMiddleware");
      expect(source, file).toMatch(/audience:\s*"customer"/);
    }
  });

  it("every route that takes a PIN verifies it inside the service method it calls", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const serviceImports = new Map(
        [...source.matchAll(/import \{ ([^}]+) \} from "(@\/backend\/services\/[^"]+)"/g)].map(
          (m) => [m[1]!.trim(), m[2]!],
        ),
      );
      const schemaImports = new Map(
        [...source.matchAll(/\b(\w+),?\s*(?:type \w+,?\s*)*\b[^;]*?from "(@\/backend\/validators\/[^"]+)"/gs)].map(
          (m) => [m[1]!, m[2]!],
        ),
      );
      // A required pin field authorizes a money action; the Privy-token reset
      // flow carries access_token instead and is not a PIN check.
      const schemaTakesPin = (name: string): boolean => {
        const spec = schemaImports.get(name);
        if (!spec) return false;
        const validatorSource = readFileSync(resolveImport(spec), "utf8");
        return /\bpin:\s*pinField\b/.test(validatorSource) && !validatorSource.includes("access_token");
      };
      const blocks = source.split(/^export const (?:GET|POST|PUT|PATCH|DELETE) =/m).slice(1);
      let checked = 0;
      for (const block of blocks) {
        const bodySchemas = [...block.matchAll(/bodyValidatorMiddleware\((\w+)\)/g)].map(
          (m) => m[1]!,
        );
        if (!bodySchemas.some(schemaTakesPin)) continue;
        const calls = [...block.matchAll(/\b(\w+)\.(\w+)\(/g)].filter(
          ([, ident]) => serviceImports.has(ident!),
        );
        expect(calls.length, `${file} pin handler`).toBeGreaterThan(0);
        for (const [, ident, method] of calls) {
          const serviceSource = readFileSync(resolveImport(serviceImports.get(ident!)!), "utf8");
          const body = methodBody(serviceSource, method!);
          expect(body.length, `${file} -> ${ident}.${method}`).toBeGreaterThan(0);
          expect(body, `${file} -> ${ident}.${method}`).toContain("verifyPin(");
          checked += 1;
        }
      }
      void checked;
    }
  });
});
