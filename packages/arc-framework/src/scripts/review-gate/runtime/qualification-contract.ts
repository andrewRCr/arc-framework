/** Closed sanitized acceptance-matrix and checkpoint contracts. */

import { hashContent } from "../../../lib/manifest/hash.js";
import { canonicalizePlainJson } from "../core/identity.js";

export const QUALIFICATION_CELL_IDS = [
  "pending-first",
  "coderabbit-label-trigger",
  "coderabbit-command-trigger",
  "coderabbit-clean",
  "coderabbit-findings",
  "coderabbit-stale",
  "coderabbit-unknown",
  "codex-comment-trigger",
  "codex-clean",
  "codex-findings",
  "codex-stale",
  "codex-unknown",
  "codex-connected-account",
  "provider-fallback",
  "await-ci",
  "await-review",
  "event-repair",
  "finding-fix",
  "finding-nonfix",
  "provider-closure",
  "ledger-reconstruction",
  "token-stateless",
  "token-classic",
  "repair-authority",
] as const;

export type QualificationCellId = typeof QUALIFICATION_CELL_IDS[number];
export type QualificationOutcome =
  | "pending"
  | "clean"
  | "findings"
  | "stale"
  | "unknown"
  | "triggered"
  | "fallback"
  | "woken"
  | "repaired"
  | "settled"
  | "reconstructed"
  | "supported"
  | "parser-only"
  | "terminal-unavailable";

export const QUALIFICATION_RUBRIC_DIMENSIONS = [
  "intent-and-scope",
  "correctness-and-failure-behavior",
  "trust-and-compatibility",
  "verification",
  "coherence",
] as const;

export interface QualificationCellScope {
  pullRequestNumber: number;
  changeRequestId: string;
  headSha: string;
}

export interface QualificationScope {
  repositoryId: string;
  repositoryRef: string;
  defaultBranch: string;
  defaultBranchSha: string;
  implementationSha: string;
  qualificationPullRequest: number;
  cellScopes: Record<QualificationCellId, QualificationCellScope>;
  expectedActorIdentity: string;
  controllerAppId: string;
  controllerBotUserId: string;
  actionsAppId: string;
  actionsBotUserId: string;
  policyVersion: string;
  parserVersion: string;
  parserDigest: string;
  providerParserVersions: Record<"coderabbit" | "codex", string>;
  rubricVersion: string;
  guidanceDigests: Record<string, string>;
  sourceIdentities: Record<string, string>;
  providerAppIds: Record<"coderabbit" | "codex", string | null>;
  providerBotUserIds: Record<"coderabbit" | "codex", string>;
  terminalUnavailableMode: "parser-only" | "terminal";
}

export interface QualificationCellResult {
  cellId: QualificationCellId;
  status: string;
  outcome: QualificationOutcome;
  capabilityProven: boolean;
  repositoryId: string;
  pullRequestNumber: number;
  headSha: string;
  workflowSha: string;
  sourceIdentity: string;
  actorIdentity: string;
  triggerPath: string | null;
  evidenceRef: string;
  rubricDimensions: string[];
  admissibleActor: boolean;
  fixture: boolean;
  rawCheckpointHash: string;
}

export interface QualificationCheckpoint {
  schemaVersion: number;
  scopeDigest: string;
  completed: QualificationCellResult[];
  chainHash: string;
  blockedCell: QualificationCellId | null;
  blockedReason: string | null;
}

export interface QualificationAcceptanceCandidate {
  schemaVersion: number;
  status: string;
  scope: QualificationScope;
  matrix: QualificationCellResult[];
  matrixDigest: string;
  checkpointChainHash: string;
}

export const QUALIFICATION_EXPECTED_OUTCOMES: Record<QualificationCellId, QualificationOutcome> = {
  "pending-first": "pending",
  "coderabbit-label-trigger": "triggered",
  "coderabbit-command-trigger": "triggered",
  "coderabbit-clean": "clean",
  "coderabbit-findings": "findings",
  "coderabbit-stale": "stale",
  "coderabbit-unknown": "unknown",
  "codex-comment-trigger": "triggered",
  "codex-clean": "clean",
  "codex-findings": "findings",
  "codex-stale": "stale",
  "codex-unknown": "unknown",
  "codex-connected-account": "parser-only",
  "provider-fallback": "fallback",
  "await-ci": "woken",
  "await-review": "woken",
  "event-repair": "repaired",
  "finding-fix": "settled",
  "finding-nonfix": "settled",
  "provider-closure": "settled",
  "ledger-reconstruction": "reconstructed",
  "token-stateless": "supported",
  "token-classic": "supported",
  "repair-authority": "repaired",
};

function credentialShaped(value: unknown, key = "root"): boolean {
  if (/token|secret|private.?key|authorization|raw.?response/iu.test(key)) return true;
  if (typeof value === "string") {
    return /gh[opsu]_[A-Za-z0-9._-]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+\S+/u.test(value);
  }
  if (Array.isArray(value)) return value.some((item) => credentialShaped(item, key));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([childKey, child]) => credentialShaped(
      child,
      key === "cellScopes" ? "cellScope" : childKey,
    ));
  }
  return false;
}

function digest(value: unknown): string {
  return hashContent(canonicalizePlainJson(value));
}

function hasExactKeys(value: object, expected: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

/** Stable identity for one immutable qualification scope. */
export function qualificationScopeDigest(scope: QualificationScope): string {
  return digest(scope);
}

/** Reject malformed, incomplete, or credential-bearing qualification coordinates. */
export function validateQualificationScope(scope: QualificationScope): string[] {
  const errors: string[] = [];
  if (credentialShaped(scope)) errors.push("credential-shaped-scope");
  if (!/^[1-9][0-9]*$/u.test(scope.repositoryId)
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(scope.repositoryRef)
    || scope.defaultBranch.length === 0) errors.push("scope-repository-invalid");
  if (![scope.defaultBranchSha, scope.implementationSha, ...Object.values(scope.cellScopes).map((item) => item.headSha)]
    .every((value) => /^[a-f0-9]{40}$/u.test(value))) errors.push("scope-sha-invalid");
  if (![scope.policyVersion, scope.parserDigest, ...Object.values(scope.guidanceDigests)]
    .every((value) => /^[a-f0-9]{64}$/u.test(value))) errors.push("scope-digest-invalid");
  if (!Number.isSafeInteger(scope.qualificationPullRequest) || scope.qualificationPullRequest <= 0
    || Object.values(scope.cellScopes).some((item) => !Number.isSafeInteger(item.pullRequestNumber)
      || item.pullRequestNumber <= 0 || item.changeRequestId.length === 0)) {
    errors.push("scope-pull-request-invalid");
  }
  if (Object.keys(scope.cellScopes).sort().join(",") !== [...QUALIFICATION_CELL_IDS].sort().join(",")) {
    errors.push("scope-cell-set-invalid");
  }
  const cellValues = Object.values(scope.cellScopes);
  if (new Set(cellValues.map((item) => item.pullRequestNumber)).size !== QUALIFICATION_CELL_IDS.length
    || new Set(cellValues.map((item) => item.changeRequestId)).size !== QUALIFICATION_CELL_IDS.length
    || new Set(cellValues.map((item) => item.headSha)).size !== QUALIFICATION_CELL_IDS.length
    || cellValues.some((item) => item.pullRequestNumber === scope.qualificationPullRequest)) {
    errors.push("scope-cell-isolation-invalid");
  }
  if (!hasExactKeys(scope.sourceIdentities, ["coderabbit", "codex"])
    || !hasExactKeys(scope.providerParserVersions, ["coderabbit", "codex"])
    || !hasExactKeys(scope.providerAppIds, ["coderabbit", "codex"])
    || !hasExactKeys(scope.providerBotUserIds, ["coderabbit", "codex"])
    || !hasExactKeys(scope.guidanceDigests, ["codex"])) errors.push("scope-provider-set-invalid");
  if (scope.rubricVersion !== "independent-analysis/v1"
    || scope.parserVersion.length === 0
    || !/^[1-9][0-9]*$/u.test(scope.expectedActorIdentity)
    || ![scope.controllerAppId, scope.controllerBotUserId, scope.actionsAppId, scope.actionsBotUserId,
      ...Object.values(scope.providerBotUserIds), ...Object.values(scope.providerAppIds).filter((value) => value !== null)]
      .every((value) => /^[1-9][0-9]*$/u.test(value))
    || !/^[a-f0-9]{64}$/u.test(scope.guidanceDigests.codex ?? "")
    || Object.values(scope.providerParserVersions).some((value) => value.length === 0)
    || scope.sourceIdentities.coderabbit !== "coderabbit-pr"
    || scope.sourceIdentities.codex !== "codex-pr") errors.push("scope-policy-input-invalid");
  return errors;
}

/** Create the only empty checkpoint accepted for a scope. */
export function createQualificationCheckpoint(scope: QualificationScope): QualificationCheckpoint {
  const scopeDigest = qualificationScopeDigest(scope);
  return {
    schemaVersion: 1,
    scopeDigest,
    completed: [],
    chainHash: digest({ scopeDigest, completed: [] }),
    blockedCell: null,
    blockedReason: null,
  };
}

/** Validate and bind one host-observed cell to the immutable scope and private raw checkpoint. */
export function validateQualificationCell(
  scope: QualificationScope,
  expectedCell: QualificationCellId,
  candidate: QualificationCellResult,
): string[] {
  const errors: string[] = [];
  if (credentialShaped(candidate)) errors.push("credential-shaped-result");
  if (candidate.status !== "passed") errors.push("cell-status-not-passed");
  if (candidate.cellId !== expectedCell) errors.push("cell-id-mismatch");
  const expectedOutcome = expectedCell === "codex-connected-account" && scope.terminalUnavailableMode === "terminal"
    ? "terminal-unavailable" : QUALIFICATION_EXPECTED_OUTCOMES[expectedCell];
  const optionalProviderCapability = expectedCell.startsWith("coderabbit-")
    || (expectedCell.startsWith("codex-") && expectedCell !== "codex-connected-account");
  const requiredOutcome = optionalProviderCapability && !candidate.capabilityProven ? "unknown" : expectedOutcome;
  if (candidate.outcome !== requiredOutcome) errors.push("cell-outcome-mismatch");
  if (typeof candidate.capabilityProven !== "boolean") errors.push("cell-capability-invalid");
  const cellScope = scope.cellScopes[expectedCell];
  if (candidate.repositoryId !== scope.repositoryId
    || candidate.pullRequestNumber !== cellScope.pullRequestNumber
    || candidate.headSha !== cellScope.headSha) errors.push("cell-scope-mismatch");
  if (candidate.workflowSha !== scope.defaultBranchSha || candidate.workflowSha !== scope.implementationSha) {
    errors.push("cell-workflow-sha-mismatch");
  }
  if (candidate.actorIdentity !== scope.expectedActorIdentity) errors.push("cell-actor-mismatch");
  if (candidate.fixture) errors.push("fixture-result-prohibited");
  if (!/^[a-f0-9]{64}$/u.test(candidate.rawCheckpointHash)) errors.push("raw-checkpoint-hash-invalid");
  if (!candidate.evidenceRef.startsWith(`https://github.com/${scope.repositoryRef}/`)) {
    errors.push("cell-evidence-missing");
  }
  const providerCell = expectedCell.startsWith("coderabbit-") || expectedCell.startsWith("codex-");
  if (providerCell
    && candidate.rubricDimensions.join(",") !== QUALIFICATION_RUBRIC_DIMENSIONS.join(",")) {
    errors.push("rubric-coverage-incomplete");
  }
  if (expectedCell.startsWith("coderabbit-") && candidate.sourceIdentity !== scope.sourceIdentities.coderabbit) {
    errors.push("coderabbit-source-mismatch");
  }
  if (expectedCell.startsWith("codex-") && candidate.sourceIdentity !== scope.sourceIdentities.codex) {
    errors.push("codex-source-mismatch");
  }
  if (expectedCell === "codex-connected-account") {
    if (scope.terminalUnavailableMode === "parser-only" && candidate.admissibleActor) {
      errors.push("connected-account-terminal-proof-invalid");
    }
    if (scope.terminalUnavailableMode === "terminal" && !candidate.admissibleActor) {
      errors.push("connected-account-terminal-proof-invalid");
    }
  }
  const expectedTrigger = expectedCell === "coderabbit-label-trigger" ? "label"
    : expectedCell === "coderabbit-command-trigger" ? "comment"
      : expectedCell === "codex-comment-trigger" ? "comment" : null;
  if (expectedTrigger !== null && candidate.triggerPath !== expectedTrigger) errors.push("trigger-path-mismatch");
  if (expectedTrigger === null && candidate.triggerPath !== null) errors.push("trigger-path-mismatch");
  return errors;
}

/** Append one exact next cell and advance the tamper-evident checkpoint chain. */
export function appendQualificationCell(
  scope: QualificationScope,
  checkpoint: QualificationCheckpoint,
  candidate: QualificationCellResult,
): QualificationCheckpoint {
  if (checkpoint.scopeDigest !== qualificationScopeDigest(scope)) throw new Error("qualification-checkpoint-scope-mismatch");
  if (checkpoint.blockedCell !== null) throw new Error("qualification-checkpoint-blocked");
  const expectedCell = QUALIFICATION_CELL_IDS[checkpoint.completed.length];
  if (expectedCell === undefined) throw new Error("qualification-matrix-already-complete");
  const errors = validateQualificationCell(scope, expectedCell, candidate);
  if (errors.length > 0) throw new Error(`qualification-cell-refused:${errors.join(",")}`);
  const completed = [...checkpoint.completed, candidate];
  return {
    ...checkpoint,
    completed,
    chainHash: digest({ prior: checkpoint.chainHash, candidate }),
  };
}

/** Revalidate a resumed checkpoint's exact prefix, chain hash, and blocked cursor. */
export function validateQualificationCheckpoint(
  scope: QualificationScope,
  checkpoint: QualificationCheckpoint,
): string[] {
  const errors: string[] = [];
  const scopeDigest = qualificationScopeDigest(scope);
  if (checkpoint.schemaVersion !== 1 || checkpoint.scopeDigest !== scopeDigest) errors.push("checkpoint-scope-mismatch");
  if (checkpoint.completed.length > QUALIFICATION_CELL_IDS.length) errors.push("checkpoint-length-invalid");
  let chainHash = digest({ scopeDigest, completed: [] });
  checkpoint.completed.forEach((cell, index) => {
    const expectedCell = QUALIFICATION_CELL_IDS[index];
    if (expectedCell === undefined) return;
    errors.push(...validateQualificationCell(scope, expectedCell, cell).map((error) => `${expectedCell}:${error}`));
    chainHash = digest({ prior: chainHash, candidate: cell });
  });
  if (checkpoint.chainHash !== chainHash) errors.push("checkpoint-chain-mismatch");
  const nextCell = QUALIFICATION_CELL_IDS[checkpoint.completed.length] ?? null;
  if ((checkpoint.blockedCell === null) !== (checkpoint.blockedReason === null)) errors.push("checkpoint-block-state-invalid");
  if (checkpoint.blockedCell !== null && checkpoint.blockedCell !== nextCell) errors.push("checkpoint-block-cursor-invalid");
  return [...new Set(errors)];
}

/** Emit a passing candidate only for the exact complete matrix and at least one hosted clean result. */
export function finalizeQualification(
  scope: QualificationScope,
  checkpoint: QualificationCheckpoint,
): QualificationAcceptanceCandidate {
  if (validateQualificationCheckpoint(scope, checkpoint).length > 0
    || checkpoint.blockedCell !== null
    || checkpoint.completed.length !== QUALIFICATION_CELL_IDS.length
    || !checkpoint.completed.some((cell) => cell.capabilityProven
      && ["coderabbit-clean", "codex-clean"].includes(cell.cellId))) {
    throw new Error("qualification-matrix-incomplete");
  }
  return {
    schemaVersion: 1,
    status: "qualified",
    scope,
    matrix: checkpoint.completed,
    matrixDigest: digest(checkpoint.completed),
    checkpointChainHash: checkpoint.chainHash,
  };
}

/** Revalidate a serialized passing candidate without trusting its status or digests. */
export function validateQualificationAcceptanceCandidate(candidate: QualificationAcceptanceCandidate): string[] {
  const errors = validateQualificationScope(candidate.scope);
  if (credentialShaped(candidate)) errors.push("credential-shaped-acceptance-candidate");
  if (candidate.schemaVersion !== 1 || candidate.status !== "qualified") errors.push("acceptance-envelope-invalid");
  if (candidate.matrix.length !== QUALIFICATION_CELL_IDS.length) errors.push("acceptance-matrix-incomplete");
  let chainHash = digest({ scopeDigest: qualificationScopeDigest(candidate.scope), completed: [] });
  candidate.matrix.forEach((cell, index) => {
    const expectedCell = QUALIFICATION_CELL_IDS[index];
    if (expectedCell === undefined) return;
    errors.push(...validateQualificationCell(candidate.scope, expectedCell, cell)
      .map((error) => `${expectedCell}:${error}`));
    chainHash = digest({ prior: chainHash, candidate: cell });
  });
  if (candidate.matrixDigest !== digest(candidate.matrix)) errors.push("acceptance-matrix-digest-mismatch");
  if (candidate.checkpointChainHash !== chainHash) errors.push("acceptance-checkpoint-chain-mismatch");
  if (!candidate.matrix.some((cell) => cell.capabilityProven
    && ["coderabbit-clean", "codex-clean"].includes(cell.cellId))) {
    errors.push("acceptance-hosted-source-missing");
  }
  return [...new Set(errors)];
}
