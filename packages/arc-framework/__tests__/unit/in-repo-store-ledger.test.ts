/** The in-repo store ledger names existing test files, and its setup sees the file being collected. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { collectedTestFile, IN_REPO_STORE_LEDGER } from "../helpers/in-repo-store-ledger.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";

const collected = collectedTestFile();
const packageRoot = resolve(import.meta.dirname, "../..");

it("names the file being collected, package-relative", () => {
  expect(collected).toBe("__tests__/unit/in-repo-store-ledger.test.ts");
});

it("lists each existing test file once, in order", () => {
  expect([...IN_REPO_STORE_LEDGER].sort()).toEqual(IN_REPO_STORE_LEDGER);
  expect(new Set(IN_REPO_STORE_LEDGER).size).toBe(IN_REPO_STORE_LEDGER.length);
  expect(IN_REPO_STORE_LEDGER.filter(file => !file.endsWith(".test.ts") || !existsSync(resolve(packageRoot, file)))).toEqual([]);
});

it("leaves an unlisted file without the override", () => {
  expect(process.env[IN_REPO_STORE_OVERRIDE]).toBeUndefined();
});
