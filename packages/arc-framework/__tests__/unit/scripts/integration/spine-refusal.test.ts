/** Every integration-spine refusal names its failed invariant and one corrective command. */

import { describe, expect, it } from "vitest";

import {
  IntegrationCheckpointResultSchema,
  CHECKPOINT_BLOCKED_REASONS,
  checkpointRemedy,
} from "../../../../src/scripts/integration/checkpoint.js";
import {
  IntegrationMergeResultSchema,
  MERGE_REFUSAL_REASONS,
  mergeRemedy,
} from "../../../../src/scripts/integration/merge.js";
import { SpineRemedySchema } from "../../../../src/scripts/integration/spine-refusal.js";

describe("spine refusal remedies", () => {
  it("derives its reason coverage from the refusal schemas", () => {
    expect(CHECKPOINT_BLOCKED_REASONS).toHaveLength(8);
    expect(MERGE_REFUSAL_REASONS).toHaveLength(12);
    expect(new Set(CHECKPOINT_BLOCKED_REASONS).size).toBe(CHECKPOINT_BLOCKED_REASONS.length);
    expect(new Set(MERGE_REFUSAL_REASONS).size).toBe(MERGE_REFUSAL_REASONS.length);
  });

  it("names an invariant and one corrective command for every checkpoint refusal", () => {
    for (const reason of CHECKPOINT_BLOCKED_REASONS) {
      const remedy = SpineRemedySchema.parse(checkpointRemedy(reason, "example"));

      expect(remedy.invariant, reason).toMatch(/\.$/u);
      expect(remedy.argv[0], reason).toBe("arc");
      expect(remedy.text, reason).toContain(remedy.invariant);
      expect(remedy.text, reason).toContain(remedy.argv.join(" "));
    }
  });

  it("names an invariant and one corrective command for every merge refusal", () => {
    for (const reason of MERGE_REFUSAL_REASONS) {
      const remedy = SpineRemedySchema.parse(mergeRemedy(reason, "example"));

      expect(remedy.invariant, reason).toMatch(/\.$/u);
      expect(remedy.argv[0], reason).toBe("arc");
      expect(remedy.text, reason).toContain(remedy.argv.join(" "));
    }
  });

  it("interpolates the refused work unit into slug-bearing commands", () => {
    expect(checkpointRemedy("candidate-convergence-pending", "example").argv)
      .toEqual(["arc", "propose", "example"]);
    expect(mergeRemedy("head-mismatch", "example").argv)
      .toEqual(["arc", "integrate", "checkpoint", "example", "--json"]);
  });

  it("rejects a checkpoint refusal envelope carrying no remedy", () => {
    expect(() => IntegrationCheckpointResultSchema.parse({
      schemaVersion: 1,
      mode: "integrate-checkpoint",
      workUnit: "example",
      state: "blocked",
      nextAction: "stop",
      reason: "candidate-missing",
      payload: { workUnit: "example" },
    })).toThrow();
  });

  it("rejects a merge refusal envelope carrying no remedy", () => {
    expect(() => IntegrationMergeResultSchema.parse({
      schemaVersion: 1,
      mode: "integrate-merge",
      workUnit: "example",
      state: "invalidated",
      nextAction: "checkpoint",
      reason: "head-mismatch",
      payload: {},
    })).toThrow();
  });
});
