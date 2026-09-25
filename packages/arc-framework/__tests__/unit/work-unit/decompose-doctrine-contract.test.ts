/** Contract proof for the shared retirement and extraction boundary. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../../..");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "../..");
const SHARED_BOUNDARY = "Extraction is the supported source-preserving arm for a started `Planning` or `Active` "
  + "source. It is entered through its own command mode, and the core retirement transform remains unchanged.";

const relativePaths = [
  "system/methods/assess-boundary-fit.md",
  "system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md",
  "reference/strategies/arc/strategy-work-organization.md",
] as const;

describe("decomposition doctrine contract", () => {
  it("states one retirement and extraction boundary on every shipped surface", () => {
    for (const relativePath of relativePaths) {
      const packaged = readFileSync(join(PACKAGE_ROOT, "arc", relativePath), "utf8");
      expect(packaged, relativePath).toMatch(softWrappedProse(SHARED_BOUNDARY));
    }
  });

  it("keeps every self-hosted projection aligned with its package source", () => {
    for (const relativePath of relativePaths) {
      const packaged = readFileSync(join(PACKAGE_ROOT, "arc", relativePath), "utf8");
      const installed = readFileSync(join(PROJECT_ROOT, ".arc", relativePath), "utf8");
      expect(installed, relativePath).toBe(packaged);
    }
  });

  it("keeps extraction record-free and lifecycle-derived", () => {
    const workflow = readFileSync(
      join(PACKAGE_ROOT, "arc", relativePaths[1]),
      "utf8",
    );
    const strategy = readFileSync(
      join(PACKAGE_ROOT, "arc", relativePaths[2]),
      "utf8",
    );

    expect(workflow).toMatch(softWrappedProse("Extraction writes no transition record, recovery record, or receipt."));
    expect(workflow).toMatch(softWrappedProse("It stores no launch advice, publication packet, or selected successor."));
    expect(strategy).toMatch(softWrappedProse("The surviving origin is the natural continuation"));
    expect(strategy).toMatch(softWrappedProse("New leaves become startable only through their landed base metas"));
  });
});
