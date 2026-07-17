/**
 * Guard: every unit test file that registers a module-level `vi.mock()` must be
 * listed in `ISOLATED_UNIT_MOCK_FILES` so it runs in the isolated `unit-mocks`
 * tier. A module mock that lands in the non-isolated `unit` tier leaks across the
 * shared worker; this guard fails loudly on drift instead of surfacing later as a
 * flaky, order-dependent failure in some unrelated test.
 *
 * When this fails, add the reported file to `isolated-unit-mock-files.ts` (or, if
 * it genuinely mocks nothing, remove the stale entry).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

import { ISOLATED_UNIT_MOCK_FILES } from "../helpers/isolated-unit-mock-files.js";

// Built from parts so this guard's own source does not match the pattern it hunts.
const MODULE_MOCK = new RegExp("\\bvi\\." + "mock\\(");

// This file names the pattern it scans for, so exclude it from its own scan.
const SELF = "isolated-mock-files.guard.test.ts";

const unitDir = fileURLToPath(new URL("../unit", import.meta.url));
const packageRoot = join(unitDir, "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.name.endsWith(".test.ts") && entry.name !== SELF) {
      out.push(full);
    }
  }
  return out;
}

function toPackageRelative(absolute: string): string {
  return relative(packageRoot, absolute).split(sep).join("/");
}

describe("module-mocking unit files are quarantined", () => {
  it("matches the isolated-tier list exactly", () => {
    const actual = walk(unitDir)
      .filter((file) => MODULE_MOCK.test(readFileSync(file, "utf8")))
      .map(toPackageRelative)
      .sort();

    expect(actual).toEqual([...ISOLATED_UNIT_MOCK_FILES].sort());
  });
});
