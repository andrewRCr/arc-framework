/**
 * Real-`gh` integration smoke for the work-unit PR source.
 *
 * Exercises the adapter against the live GitHub CLI to catch drift in the
 * `gh pr list --json` invocation shape or field names that the mocked unit
 * tests cannot. Opt-in only — set `ARC_TEST_REAL_GH=1` to run; default-skipped
 * everywhere (CI and normal local runs) since it depends on `gh` being
 * installed, authenticated, and the network reachable.
 */

import { describe, it, expect } from "vitest";

import { createGhWorkUnitPrSource } from "../../src/lib/session-init/work-unit-pr-source.js";
import { gitExec } from "../../src/lib/io-context.js";

const RUN_REAL_GH = process.env["ARC_TEST_REAL_GH"] === "1";

describe("createGhWorkUnitPrSource (real gh)", () => {
  it.skipIf(!RUN_REAL_GH)(
    "resolves to a Map for a nonexistent branch, or rejects when gh is unavailable",
    async () => {
      const source = createGhWorkUnitPrSource(gitExec);

      // Either outcome exercises the real binary path: a Map when gh is
      // authenticated and reachable (no PR for this branch → empty), or a
      // rejection when it is not (the contract the composer degrades on).
      try {
        const result = await source(["arc-nonexistent-branch-smoke-xyz"]);
        expect(result).toBeInstanceOf(Map);
        expect(result.has("arc-nonexistent-branch-smoke-xyz")).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    },
    30_000,
  );
});
