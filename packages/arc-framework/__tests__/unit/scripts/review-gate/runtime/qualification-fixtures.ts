import {
  QUALIFICATION_CELL_IDS,
  QUALIFICATION_RUBRIC_DIMENSIONS,
  type QualificationCellId,
  type QualificationCellResult,
  type QualificationOutcome,
  type QualificationScope,
} from "../../../../../src/scripts/review-gate/runtime/qualification-contract.js";
import { computePolicyVersion } from "../../../../../src/scripts/review-gate/core/identity.js";
import { SELF_HOSTING_POLICY } from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);

export function qualificationScope(): QualificationScope {
  const cellScopes = Object.fromEntries(QUALIFICATION_CELL_IDS.map((cellId, index) => [cellId, {
    pullRequestNumber: 7 + index,
    changeRequestId: `CR_kwDOqualification_${index + 1}`,
    headSha: (index + 1).toString(16).padStart(40, "0"),
  }])) as QualificationScope["cellScopes"];
  return {
    repositoryId: "100",
    repositoryRef: "o/r",
    defaultBranch: "main",
    defaultBranchSha: SHA,
    implementationSha: SHA,
    qualificationPullRequest: 100,
    cellScopes,
    expectedActorIdentity: "200",
    controllerAppId: "4268856",
    controllerBotUserId: "302312524",
    actionsAppId: "15368",
    actionsBotUserId: "41898282",
    policyVersion: computePolicyVersion({ policy: SELF_HOSTING_POLICY }),
    parserVersion: "1",
    parserDigest: "d".repeat(64),
    providerParserVersions: { coderabbit: "coderabbit-evidence/v1", codex: "codex-evidence/v1" },
    rubricVersion: "independent-analysis/v1",
    guidanceDigests: { codex: "e".repeat(64) },
    sourceIdentities: { coderabbit: "coderabbit-pr", codex: "codex-pr" },
    providerAppIds: { coderabbit: null, codex: "1144995" },
    providerBotUserIds: { coderabbit: "136622811", codex: "199175422" },
    terminalUnavailableMode: "parser-only",
  };
}

const outcomes: Record<QualificationCellId, QualificationOutcome> = {
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

export function qualificationCell(cellId: QualificationCellId): QualificationCellResult {
  const scope = qualificationScope();
  const cellScope = scope.cellScopes[cellId];
  const provider = cellId.startsWith("coderabbit-") || cellId.startsWith("codex-");
  return {
    cellId,
    status: "passed",
    outcome: outcomes[cellId],
    capabilityProven: true,
    repositoryId: scope.repositoryId,
    pullRequestNumber: cellScope.pullRequestNumber,
    headSha: cellScope.headSha,
    workflowSha: scope.defaultBranchSha,
    sourceIdentity: cellId.startsWith("coderabbit-") ? "coderabbit-pr"
      : cellId.startsWith("codex-") ? "codex-pr" : "arc-controller",
    actorIdentity: scope.expectedActorIdentity,
    triggerPath: cellId === "coderabbit-label-trigger" ? "label"
      : ["coderabbit-command-trigger", "codex-comment-trigger"].includes(cellId) ? "comment" : null,
    evidenceRef: `https://github.com/o/r/actions/${cellId}`,
    rubricDimensions: provider ? [...QUALIFICATION_RUBRIC_DIMENSIONS] : [],
    admissibleActor: false,
    fixture: false,
    rawCheckpointHash: HASH,
  };
}
