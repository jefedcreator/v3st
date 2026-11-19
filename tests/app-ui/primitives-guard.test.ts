import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "src/primitives");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));

describe("primitive source guards", () => {
  it("keeps the icon and import rules", () => {
    for (const { name, text } of files) {
      expect(text.includes("lucide-react"), `${name} uses lucide-react`).toBe(false);
      expect(/from "@radix-ui\/react-/.test(text), `${name} uses scoped radix imports`).toBe(false);
      expect(/from "@\/utils"/.test(text), `${name} imports the utils barrel`).toBe(false);
      expect(
        /from "@phosphor-icons\/react"/.test(text) && !/import type/.test(text),
        `${name} imports Phosphor outside the SSR entry`,
      ).toBe(false);
      if (/cn\(/.test(text)) {
        expect(text.includes('from "@/utils/cn"'), `${name} must import cn from @/utils/cn`).toBe(
          true,
        );
      }
    }
  });
  it("styles the dialog as a responsive sheet", () => {
    const dialog = files.find((file) => file.name === "dialog.tsx")?.text ?? "";
    for (const token of [
      "max-h-[92dvh]",
      "rounded-t-[28px]",
      "sm:max-w-[480px]",
      "motion-reduce:",
    ]) {
      expect(dialog).toContain(token);
    }
  });
  it("exports the app's primitives from the barrel", () => {
    const index = readFileSync(join(dir, "index.ts"), "utf8");
    for (const name of ["money-text", "Money", "KeyValue", "CopyButton", "dialog", "input-otp"]) {
      expect(index).toContain(name);
    }
  });
});
