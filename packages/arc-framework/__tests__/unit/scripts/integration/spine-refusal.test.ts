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
import {
  REVIEW_PRE_PUBLICATION_REFUSAL_CODES,
  ReviewCommandErrorEnvelopeSchema,
  prePublicationRemedy,
  prePublicationTargetRemedy,
} from "../../../../src/scripts/review-gate/core/review-command-envelope.js";

describe("spine refusal remedies", () => {
  it("derives its reason coverage from the refusal schemas", () => {
    expect(CHECKPOINT_BLOCKED_REASONS).toHaveLength(9);
    expect(MERGE_REFUSAL_REASONS).toHaveLength(11);
    expect(REVIEW_PRE_PUBLICATION_REFUSAL_CODES).toHaveLength(3);
    expect(new Set(CHECKPOINT_BLOCKED_REASONS).size).toBe(CHECKPOINT_BLOCKED_REASONS.length);
    expect(new Set(MERGE_REFUSAL_REASONS).size).toBe(MERGE_REFUSAL_REASONS.length);
    expect(new Set(REVIEW_PRE_PUBLICATION_REFUSAL_CODES).size)
      .toBe(REVIEW_PRE_PUBLICATION_REFUSAL_CODES.length);
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

  it("names an invariant and one corrective command for every pre-publication refusal", () => {
    for (const code of REVIEW_PRE_PUBLICATION_REFUSAL_CODES) {
      const remedy = SpineRemedySchema.parse(prePublicationRemedy(code, "example"));

      expect(remedy.invariant, code).toMatch(/\.$/u);
      expect(remedy.argv[0], code).toBe("arc");
      expect(remedy.text, code).toContain(remedy.invariant);
      expect(remedy.text, code).toContain(remedy.argv.join(" "));
    }
  });

  it("points a refusal whose own operand never resolved at work-unit discovery", () => {
    const remedy = SpineRemedySchema.parse(prePublicationTargetRemedy());

    expect(remedy.argv).toEqual(["arc", "status", "--project", "--json"]);
    expect(remedy.text).toContain(remedy.invariant);
  });

  it("interpolates the refused work unit into slug-bearing commands", () => {
    expect(checkpointRemedy("candidate-convergence-pending", "example").argv)
      .toEqual(["arc", "propose", "example"]);
    expect(mergeRemedy("head-mismatch", "example").argv)
      .toEqual(["arc", "integrate", "checkpoint", "example", "--json"]);
    expect(prePublicationRemedy("corrupt-state", "example").argv)
      .toEqual(["arc", "review", "pre-publication", "example", "--json"]);
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

  it("rejects a pre-publication refusal envelope carrying no remedy", () => {
    const refusal = {
      schemaVersion: 1,
      mode: "review-pre-publication",
      diagnostics: [],
      error: { code: "corrupt-state", message: "the durable record is unreadable" },
    };

    expect(() => ReviewCommandErrorEnvelopeSchema.parse(refusal)).toThrow();
    expect(ReviewCommandErrorEnvelopeSchema.parse({
      ...refusal,
      remedy: prePublicationRemedy("corrupt-state", "example"),
    })).toMatchObject({ remedy: { argv: ["arc", "review", "pre-publication", "example", "--json"] } });
  });

  it("leaves the other review-family refusal envelopes unchanged", () => {
    expect(ReviewCommandErrorEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-reduce",
      diagnostics: [],
      error: { code: "corrupt-state", message: "the durable record is unreadable" },
    })).toMatchObject({ mode: "review-reduce" });
  });
});
