/** Errand mutation human and JSON command-boundary parity. */

import { describe, expect, it } from "vitest";

import {
  formatErrandAbandonResult,
  formatErrandLeaveResult,
  formatErrandLinkResult,
  formatErrandOpenResult,
  formatErrandPromoteResult,
} from "../../../src/handlers/errand.js";
import { createLocusMutationResult } from "../../../src/lib/locus/mutation.js";
import { createErrandPromotionResult } from "../../../src/lib/errand/promotion-result.js";
import { createErrandTerminalResult } from "../../../src/lib/errand/terminal-result.js";

const refusal = createLocusMutationResult({
  outcome: "refused",
  operation: "errand-open",
  reason: "lease-unknown",
  recommendedPromptText: "The existing lease cannot be verified.",
});

describe("errand leave result rendering", () => {
  const leaveRefusal = createErrandTerminalResult({
    outcome: "refused",
    operation: "errand-leave",
    subject: null,
    checkoutPath: null,
    generation: null,
    reason: "preservation-unproven",
    recommendedPromptText: "Push the exact Errand head before leaving.",
  });

  it("keeps JSON and human refusal output on the same producer result", () => {
    const json = formatErrandLeaveResult(leaveRefusal, true);
    expect(JSON.parse(json.text)).toStrictEqual(leaveRefusal);
    expect(json).toMatchObject({ stream: "stdout", exitCode: 1 });
    expect(formatErrandLeaveResult(leaveRefusal, false)).toEqual({
      stream: "stderr",
      text: "Push the exact Errand head before leaving.",
      exitCode: 1,
    });
  });
});

describe("errand materialize result rendering", () => {
  it("preserves the validated materialize operation across JSON and human rendering", () => {
    const result = createLocusMutationResult({
      outcome: "refused",
      operation: "errand-materialize",
      reason: "preservation-unproven",
      recommendedPromptText: "The remote head changed.",
    });
    expect(JSON.parse(formatErrandOpenResult(result, true).text)).toStrictEqual(result);
    expect(formatErrandOpenResult(result, false)).toEqual({
      stream: "stderr",
      text: "Refused [preservation-unproven]: The remote head changed.",
      exitCode: 1,
    });
  });
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

  it("renders typed errors on stderr for humans", () => {
    const error = createLocusMutationResult({
      outcome: "error",
      operation: "errand-open",
      error: { code: "locus.errand-open.config", message: "Configuration is unavailable." },
      recommendedPromptText: "Inspect the configuration before retrying.",
    });

    expect(formatErrandOpenResult(error, false)).toEqual({
      stream: "stderr",
      text: "Error [locus.errand-open.config]: Configuration is unavailable.",
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
      originEntrySourceDigest: `sha256:${"a".repeat(64)}`,
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
    const result = createErrandTerminalResult({
      outcome: "idempotent",
      operation: "errand-abandon",
      subject: null,
      generation: null,
      checkoutPath: null,
      parentCheckoutPath: null,
      settlement: { kind: "capture", disposition: "absent", originEntry: null },
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
    const result = createErrandPromotionResult({
      outcome: "refused",
      operation: "errand-promote",
      subject: null,
      checkoutPath: null,
      generation: null,
      reason: "promotion-source-invalid",
      recommendedPromptText: "Promotion source changed.",
    });

    const jsonOutput = formatErrandPromoteResult(result, true);
    expect(jsonOutput).toEqual({
      stream: "stdout",
      text: `${JSON.stringify(result)}\n`,
      exitCode: 1,
    });
    expect(JSON.parse(jsonOutput.text)).toStrictEqual(result);
    expect(formatErrandPromoteResult(result, false)).toEqual({
      stream: "stderr",
      text: "Refused [promotion-source-invalid]: Promotion source changed.",
      exitCode: 1,
    });
  });
});
