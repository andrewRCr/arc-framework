/** Errand mutation human and JSON command-boundary parity. */

import { describe, expect, it } from "vitest";

import {
  formatErrandAbandonResult,
  formatErrandLinkResult,
  formatErrandOpenResult,
  formatErrandPromoteResult,
} from "../../../src/handlers/errand.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";

const refusal = createLocusMutationResult({
  outcome: "refused",
  operation: "errand-open",
  reason: "lease-unknown",
  recommendedPromptText: "The existing lease cannot be verified.",
});

describe("errand open result rendering", () => {
  it("renders JSON from the exact validated producer result", () => {
    const output = formatErrandOpenResult(refusal, true);
    expect(output).toEqual({ stream: "stdout", text: `${JSON.stringify(refusal)}\n`, exitCode: 1 });
    expect(JSON.parse(output.text)).toStrictEqual(refusal);
  });

  it("renders the same refusal reason and narration for humans", () => {
    expect(formatErrandOpenResult(refusal, false)).toEqual({
      stream: "stderr",
      text: "Refused [lease-unknown]: The existing lease cannot be verified.",
      exitCode: 1,
    });
  });
});

describe("errand link result rendering", () => {
  const linked = createLocusMutationResult({
    outcome: "applied",
    operation: "errand-link",
    allocation: null,
    recordId: null,
    leaseId: null,
    activeLocusPath: null,
    sessionHomePath: null,
    identity: {
      kind: "errand",
      key: "fix-output",
      claimId: "0123456789abcdef0123456789abcdef",
      protection: "full",
      purpose: "errand",
      origin: "inbox",
      originEntry: "Fix output capture",
      state: "open",
      branch: "chore/fix-output",
      savedHead: null,
      changeRequest: null,
    },
    originEntry: "Fix output capture",
    restoredParent: null,
    nextOffer: null,
    recommendedPromptText: "Linked Errand 'fix-output' to inbox capture 'Fix output capture'.",
  });

  it("emits the exact validated producer result as JSON", () => {
    const output = formatErrandLinkResult(linked, true);
    expect(output).toEqual({ stream: "stdout", text: `${JSON.stringify(linked)}\n`, exitCode: 0 });
    expect(JSON.parse(output.text)).toStrictEqual(linked);
  });

  it("uses the producer narration for human output", () => {
    expect(formatErrandLinkResult(linked, false)).toEqual({
      stream: "stdout",
      text: linked.recommendedPromptText,
      exitCode: 0,
    });
  });
});

describe("errand abandon result rendering", () => {
  it("uses the shared result renderer in JSON and human modes", () => {
    const result = createLocusMutationResult({
      outcome: "idempotent",
      operation: "errand-abandon",
      allocation: null,
      recordId: null,
      leaseId: null,
      activeLocusPath: null,
      sessionHomePath: null,
      identity: null,
      originEntry: null,
      restoredParent: null,
      nextOffer: null,
      recommendedPromptText: "Already abandoned.",
    });

    expect(formatErrandAbandonResult(result, true)).toEqual({
      stream: "stdout",
      text: `${JSON.stringify(result)}\n`,
      exitCode: 0,
    });
    expect(formatErrandAbandonResult(result, false)).toEqual({
      stream: "stdout",
      text: "Already abandoned.",
      exitCode: 0,
    });
  });
});

describe("errand promote result rendering", () => {
  it("renders the same validated result for JSON and human callers", () => {
    const result = createLocusMutationResult({
      outcome: "refused",
      operation: "errand-promote",
      reason: "promotion-source-invalid",
      recommendedPromptText: "Promotion source changed.",
    });

    expect(JSON.parse(formatErrandPromoteResult(result, true).text)).toStrictEqual(result);
    expect(formatErrandPromoteResult(result, false)).toEqual({
      stream: "stderr",
      text: "Refused [promotion-source-invalid]: Promotion source changed.",
      exitCode: 1,
    });
  });
});
