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
import { legacyV1QualificationCell, legacyV1QualificationScope } from "./qualification-fixtures.js";

const HASH = "b".repeat(64);

describe("qualification acceptance contract", () => {
  it("resumes a literal pre-cutover Unicode checkpoint and extends its chain", () => {
    const scope = { ...legacyV1QualificationScope(), defaultBranch: "e\u0301" };
    const firstCell = {
      ...legacyV1QualificationCell("pending-first"),
      evidenceRef: "https://github.com/o/r/actions/e\u0301",
    };
    const checkpoint = {
      schemaVersion: 1,
      scopeDigest: "08113279c7504418a2df2413369c8e0d0806d9b38a7c809ee3b81934e7d6892d",
      completed: [firstCell],
      chainHash: "6d93b6d1fe70cc04b4e1b6a5de57fafad6a14430b0db5906782d4bae8c636cd2",
      blockedCell: null,
      blockedReason: null,
    };

    expect(validateQualificationCheckpoint(scope, checkpoint)).toEqual([]);
    const extended = appendQualificationCell(
      scope,
      checkpoint,
      legacyV1QualificationCell("coderabbit-label-trigger"),
    );
    expect(extended.scopeDigest).toBe(checkpoint.scopeDigest);
    expect(extended.completed[0]).toEqual(firstCell);
    expect(extended.chainHash).toBe("bd2d958b649a3ffadf9c76b0f9adf28250e4dd48b7e361f98471bc27d5401c15");
  });

  it("validates literal pre-cutover acceptance digests", () => {
    const scope = { ...legacyV1QualificationScope(), defaultBranch: "e\u0301" };
    let checkpoint = createQualificationCheckpoint(scope);
    for (const cellId of QUALIFICATION_CELL_IDS) {
      const cell = legacyV1QualificationCell(cellId);
      checkpoint = appendQualificationCell(scope, checkpoint, cellId === "pending-first"
        ? { ...cell, evidenceRef: "https://github.com/o/r/actions/e\u0301" }
        : cell);
    }
    const candidate = {
      ...finalizeQualification(scope, checkpoint),
      matrixDigest: "dcc3abb0069cf1ab4d6f640291901cbff79468b32f72cce61a21e035d15afcfe",
      checkpointChainHash: "40417f7c92ebd13cc88e77ee919b378e25bd982e8f7b362846cb04cad8ca7c0e",
    };

    expect(validateQualificationAcceptanceCandidate(candidate)).toEqual([]);
  });

  it("accepts only the exact complete matrix and emits stable sanitized identity", () => {
    const scope = legacyV1QualificationScope();
    let checkpoint = createQualificationCheckpoint(scope);
    for (const cellId of QUALIFICATION_CELL_IDS) checkpoint = appendQualificationCell(scope, checkpoint, legacyV1QualificationCell(cellId));
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
    const scope = legacyV1QualificationScope();
    const valid = legacyV1QualificationCell("coderabbit-clean");
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
    const scope = legacyV1QualificationScope();
    expect(validateQualificationAcceptanceCandidate({
      ...finalizeQualification(scope, QUALIFICATION_CELL_IDS.reduce(
        (checkpoint, cellId) => appendQualificationCell(scope, checkpoint, legacyV1QualificationCell(cellId)),
        createQualificationCheckpoint(scope),
      )),
      scope: { ...scope, guidanceDigests: {} },
    })).toContain("scope-policy-input-invalid");
  });

  it("requires every matrix cell to use an isolated PR, change request, and head", () => {
    const scope = legacyV1QualificationScope();
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
    const scope = legacyV1QualificationScope();
    const parserOnly = legacyV1QualificationCell("codex-connected-account");
    expect(validateQualificationCell(scope, "codex-connected-account", parserOnly)).toEqual([]);
    expect(validateQualificationCell(scope, "codex-connected-account", { ...parserOnly, admissibleActor: true }))
      .toContain("connected-account-terminal-proof-invalid");
    const terminalScope = { ...scope, terminalUnavailableMode: "terminal" as const };
    expect(validateQualificationCell(terminalScope, "codex-connected-account", {
      ...parserOnly, outcome: "terminal-unavailable", admissibleActor: true,
    })).toEqual([]);
  });

  it("detects checkpoint tampering and refuses an incomplete candidate", () => {
    const scope = legacyV1QualificationScope();
    const checkpoint = appendQualificationCell(scope, createQualificationCheckpoint(scope), legacyV1QualificationCell("pending-first"));
    expect(validateQualificationCheckpoint(scope, { ...checkpoint, chainHash: HASH })).toContain("checkpoint-chain-mismatch");
    expect(() => finalizeQualification(scope, checkpoint)).toThrow("qualification-matrix-incomplete");
  });

  it("detects a forged serialized acceptance digest", () => {
    const scope = legacyV1QualificationScope();
    let checkpoint = createQualificationCheckpoint(scope);
    for (const cellId of QUALIFICATION_CELL_IDS) checkpoint = appendQualificationCell(scope, checkpoint, legacyV1QualificationCell(cellId));
    const candidate = finalizeQualification(scope, checkpoint);
    expect(validateQualificationAcceptanceCandidate({ ...candidate, matrixDigest: HASH }))
      .toContain("acceptance-matrix-digest-mismatch");
    expect(validateQualificationAcceptanceCandidate({ ...candidate, token: "credential" } as typeof candidate))
      .toContain("credential-shaped-acceptance-candidate");
  });
});
