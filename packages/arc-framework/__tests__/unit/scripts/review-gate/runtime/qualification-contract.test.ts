import { describe, expect, it } from "vitest";

import {
  QUALIFICATION_CELL_IDS,
  appendQualificationCell,
  createQualificationCheckpoint,
  finalizeQualification,
  validateQualificationCell,
  validateQualificationAcceptanceCandidate,
  validateQualificationCheckpoint,
  validateQualificationScope,
} from "../../../../../src/scripts/review-gate/runtime/qualification-contract.js";
import { qualificationCell, qualificationScope } from "./qualification-fixtures.js";

const HASH = "b".repeat(64);

describe("qualification acceptance contract", () => {
  it("accepts only the exact complete matrix and emits stable sanitized identity", () => {
    const scope = qualificationScope();
    let checkpoint = createQualificationCheckpoint(scope);
    for (const cellId of QUALIFICATION_CELL_IDS) checkpoint = appendQualificationCell(scope, checkpoint, qualificationCell(cellId));
    expect(validateQualificationCheckpoint(scope, checkpoint)).toEqual([]);
    const candidate = finalizeQualification(scope, checkpoint);
    expect(candidate).toMatchObject({
      status: "qualified",
      matrix: expect.arrayContaining([expect.objectContaining({ cellId: "token-stateless" })]),
      matrixDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(validateQualificationAcceptanceCandidate(candidate)).toEqual([]);
  });

  it("refuses fixtures, credentials, incomplete rubric coverage, and changed workflow scope", () => {
    const scope = qualificationScope();
    const valid = qualificationCell("coderabbit-clean");
    expect(validateQualificationCell(scope, "coderabbit-clean", { ...valid, fixture: true }))
      .toContain("fixture-result-prohibited");
    expect(validateQualificationCell(scope, "coderabbit-clean", {
      ...valid, evidenceRef: "Bearer credential-secret",
    })).toContain("credential-shaped-result");
    expect(validateQualificationCell(scope, "coderabbit-clean", { ...valid, rubricDimensions: [] }))
      .toContain("rubric-coverage-incomplete");
    expect(validateQualificationCell(scope, "coderabbit-clean", { ...valid, workflowSha: "f".repeat(40) }))
      .toContain("cell-workflow-sha-mismatch");
    expect(validateQualificationCell(scope, "coderabbit-clean", { ...valid, evidenceRef: "https://example.test/e" }))
      .toContain("cell-evidence-missing");
    expect(validateQualificationCell(scope, "coderabbit-clean", { ...valid, triggerPath: "comment" }))
      .toContain("trigger-path-mismatch");
    expect(validateQualificationCell(scope, "coderabbit-clean", {
      ...valid, capabilityProven: false, outcome: "unknown",
    })).toEqual([]);
  });

  it("requires the enabled policy inputs needed by activation", () => {
    const scope = qualificationScope();
    expect(validateQualificationAcceptanceCandidate({
      ...finalizeQualification(scope, QUALIFICATION_CELL_IDS.reduce(
        (checkpoint, cellId) => appendQualificationCell(scope, checkpoint, qualificationCell(cellId)),
        createQualificationCheckpoint(scope),
      )),
      scope: { ...scope, guidanceDigests: {} },
    })).toContain("scope-policy-input-invalid");
  });

  it("requires every matrix cell to use an isolated PR, change request, and head", () => {
    const scope = qualificationScope();
    const duplicate = scope.cellScopes["pending-first"];
    expect(validateQualificationScope({
      ...scope,
      cellScopes: { ...scope.cellScopes, "coderabbit-label-trigger": duplicate },
    })).toContain("scope-cell-isolation-invalid");
    expect(validateQualificationScope({
      ...scope,
      qualificationPullRequest: duplicate.pullRequestNumber,
    })).toContain("scope-cell-isolation-invalid");
  });

  it("keeps connected-account behavior parser-only until an admissible actor proves terminality", () => {
    const scope = qualificationScope();
    const parserOnly = qualificationCell("codex-connected-account");
    expect(validateQualificationCell(scope, "codex-connected-account", parserOnly)).toEqual([]);
    expect(validateQualificationCell(scope, "codex-connected-account", { ...parserOnly, admissibleActor: true }))
      .toContain("connected-account-terminal-proof-invalid");
    const terminalScope = { ...scope, terminalUnavailableMode: "terminal" as const };
    expect(validateQualificationCell(terminalScope, "codex-connected-account", {
      ...parserOnly, outcome: "terminal-unavailable", admissibleActor: true,
    })).toEqual([]);
  });

  it("detects checkpoint tampering and refuses an incomplete candidate", () => {
    const scope = qualificationScope();
    const checkpoint = appendQualificationCell(scope, createQualificationCheckpoint(scope), qualificationCell("pending-first"));
    expect(validateQualificationCheckpoint(scope, { ...checkpoint, chainHash: HASH })).toContain("checkpoint-chain-mismatch");
    expect(() => finalizeQualification(scope, checkpoint)).toThrow("qualification-matrix-incomplete");
  });

  it("detects a forged serialized acceptance digest", () => {
    const scope = qualificationScope();
    let checkpoint = createQualificationCheckpoint(scope);
    for (const cellId of QUALIFICATION_CELL_IDS) checkpoint = appendQualificationCell(scope, checkpoint, qualificationCell(cellId));
    const candidate = finalizeQualification(scope, checkpoint);
    expect(validateQualificationAcceptanceCandidate({ ...candidate, matrixDigest: HASH }))
      .toContain("acceptance-matrix-digest-mismatch");
    expect(validateQualificationAcceptanceCandidate({ ...candidate, token: "credential" } as typeof candidate))
      .toContain("credential-shaped-acceptance-candidate");
  });
});
