/** Native lint selection excludes disposable loader output and preserves source lookalikes. */
import { ESLint } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: packageRoot });

describe("loader bundle lint selection", () => {
  it.each([
    "src/control.bundled_.mjs",
    "src/control.bundled_abc123.cjs",
    "src/scripts/build-schema.bundled_fojxy9477o9.mjs",
    "__tests__/nested/control.bundled_0123456789abc.cjs",
  ])("ignores the disposable module %s", async (filename) => {
    expect(await eslint.isPathIgnored(resolve(packageRoot, filename))).toBe(true);
  }, 10_000);

  it.each([
    "src/control.js",
    "src/control.bundled_abc123.js",
    "src/control.bundled_abc123.ts",
    "src/control.bundled_ABC123.mjs",
    "src/control.bundled_abcdefghijklmn.cjs",
  ])("retains the ordinary source sibling %s", async (filename) => {
    expect(await eslint.isPathIgnored(resolve(packageRoot, filename))).toBe(false);
  });
});
