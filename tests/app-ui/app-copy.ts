import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ROOT = process.cwd();

export const APP_SOURCE_DIRS = [
  "src/components/app",
  "src/app/(app)",
  "src/app/(auth)",
  "src/app/(setup)",
];

const SKIP_ATTRIBUTE_NAMES = new Set([
  "className",
  "href",
  "id",
  "htmlFor",
  "name",
  "type",
  "autoComplete",
  "inputMode",
  "key",
  "role",
  "layoutId",
  "weight",
]);

function walk(dir: string, out: string[]) {
  const full = path.join(ROOT, dir);
  if (!existsSync(full)) return;
  for (const entry of readdirSync(full)) {
    const entryPath = path.join(full, entry);
    if (statSync(entryPath).isDirectory()) {
      walk(path.join(dir, entry), out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(entryPath);
    }
  }
  return;
}

export function collectCopy(dirs: string[]): string[] {
  const files: string[] = [];
  for (const dir of dirs) walk(dir, files);
  const copy: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node, insideJsxAttribute: boolean) {
      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(sf).replace(/^["']|["']$/g, "");
        const skip = SKIP_ATTRIBUTE_NAMES.has(name) || name.startsWith("data-");
        node.getChildren(sf).forEach((child) => visit(child, insideJsxAttribute || skip));
        return;
      }
      if (insideJsxAttribute) return;
      if (ts.isJsxText(node)) {
        const text = node.getText(sf).replace(/\{\s*"?\s*"?\}/g, "").trim();
        if (text !== "") copy.push(text);
        return;
      }
      if (ts.isStringLiteral(node)) {
        const value = node.text.trim();
        if (
          value !== "" &&
          !value.startsWith("/") &&
          !/^[A-Z][A-Z0-9_]+$/.test(value) &&
          !/^[@./#]/.test(value)
        ) {
          copy.push(value);
        }
        return;
      }
      if (ts.isTemplateLiteral(node)) {
        copy.push(node.getText(sf));
        return;
      }
      node.forEachChild((child) => visit(child, insideJsxAttribute));
      return;
    }
    if (ts.isSourceFile(sf)) sf.forEachChild((child) => visit(child, false));
  }
  return copy;
}


