/** Exact branch preservation required before ordinary Errand abandonment. */

import { describe, expect, it } from "vitest";

import { proveOrdinaryErrandAbandonmentPreservation } from "../../../src/lib/errand/abandon-runtime.js";
import { TransientIdentityRecordV3Schema } from "../../../src/lib/errand/identity-record.js";
import type { OrdinaryErrandRecord } from "../../../src/lib/errand/identity-transitions.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const HEAD = "a".repeat(40);

function paused(savedHead = HEAD): OrdinaryErrandRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    slug: "discard",
    claimId: "c".repeat(32),
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:01:00.000Z",
    kind: "errand",
    purpose: "errand",
    intent: "discard",
    branch: "chore/discard",
    origin: "description",
    originEntry: null,
    state: "paused",
    savedHead,
    changeRequest: null,
  }) as OrdinaryErrandRecord;
}

describe("proveOrdinaryErrandAbandonmentPreservation", () => {
  it("accepts the exact branch head when configured base already preserves it", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${HEAD}\n`, stderr: "" };
      if (args[0] === "merge-base") return { stdout: "", stderr: "" };
      throw new Error(`Unexpected git operation: ${args.join(" ")}`);
    };

    await expect(proveOrdinaryErrandAbandonmentPreservation(exec, "main", paused()))
      .resolves.toEqual({ kind: "ready", head: HEAD });
  });

  it("refuses a missing branch and a branch moved from its recorded head", async () => {
    const missing: GitExec = async () => { throw { exitCode: 128, stderr: "unknown revision" }; };
    await expect(proveOrdinaryErrandAbandonmentPreservation(missing, "main", paused()))
      .resolves.toMatchObject({ kind: "refused", reason: "preservation-unproven" });

    const moved: GitExec = async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${"b".repeat(40)}\n`, stderr: "" };
      throw new Error(`Unexpected git operation: ${args.join(" ")}`);
    };
    await expect(proveOrdinaryErrandAbandonmentPreservation(moved, "main", paused()))
      .resolves.toMatchObject({ kind: "refused", reason: "preservation-unproven" });
  });
});
