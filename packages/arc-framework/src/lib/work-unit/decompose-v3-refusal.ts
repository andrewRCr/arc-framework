/** Strict machine-readable refusal contracts for decomposition command boundaries. */

import { z } from "zod";

import {
  digestBytes,
  sortByCanonicalBytes,
} from "../canonical/canonical-json.js";
import {
  spineRemedy,
  SpineRemedySchema,
  type SpineRemedy,
} from "../../scripts/integration/spine-refusal.js";
import {
  renderV3DecomposeArgv,
  v3DecomposeAdvanceBaseArgv,
  v3DecomposeExecuteArgv,
  v3DecomposeExtractArgv,
  v3DecomposeFinishApplyArgv,
  v3DecomposeFinishPreviewArgv,
  v3DecomposePreflightArgv,
} from "./decompose-command-renderer.js";
import type { V3DecomposeOperationRecovery } from "./decompose-v3-operation.js";
import { decomposeCandidateBranch } from "./decompose-candidate.js";
import { V3_FINISH_REMEDIES } from "./decompose-v3-finish-remedies.js";
import {
  V3_GIT_PREFLIGHT_REMEDIES,
  V3_OPERATION_RETRY_REMEDIES,
  V3_PREFLIGHT_REMEDIES,
  type V3PreflightRemedyDefinition,
} from "./decompose-v3-remedy-definitions.js";

const V3DecomposeEvidenceValueSchema = z.json();
export type V3DecomposeEvidenceValue = z.infer<typeof V3DecomposeEvidenceValueSchema>;

/** Two bounded JSON operands that differ at a refusal-producing comparison. */
export const V3DecomposeRefusalEvidenceSchema = z.strictObject({
  expected: V3DecomposeEvidenceValueSchema,
  actual: V3DecomposeEvidenceValueSchema,
});
export type V3DecomposeRefusalEvidence = z.infer<typeof V3DecomposeRefusalEvidenceSchema>;

/** Project bytes into the bounded fact carried by comparison evidence. */
export function v3DecomposeByteEvidence(bytes: Uint8Array): {
  contentDigest: ReturnType<typeof digestBytes>;
  byteLength: number;
} {
  return { contentDigest: digestBytes(bytes), byteLength: bytes.byteLength };
}

/** Project a missing comparison operand without using an undefined JSON value. */
export function v3DecomposeAbsentEvidence(): { kind: "absent" } {
  return { kind: "absent" };
}

/** Project an unordered collection into canonical JSON byte order. */
export function v3DecomposeSetEvidence(
  values: Iterable<V3DecomposeEvidenceValue>,
): V3DecomposeEvidenceValue[] {
  return sortByCanonicalBytes([...values]);
}

/** The core refusal emitted by every selected decomposition command mode. */
export const V3DecomposeCoreRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  reason: z.string().min(1),
  locus: z.string().min(1).optional(),
  evidence: V3DecomposeRefusalEvidenceSchema.optional(),
  remedy: SpineRemedySchema,
});
export type V3DecomposeCoreRefusal = z.infer<typeof V3DecomposeCoreRefusalSchema>;

/** The first strict operation refusal carried end to end through retirement execution. */
export const V3UncoveredRetirementContentRefusalSchema = z.strictObject({
  status: z.literal("refused"),
  stage: z.literal("repository-plan"),
  reason: z.string().regex(/(?:^|:)uncovered-retirement-content$/u),
  locus: z.string().min(1),
  evidence: V3DecomposeRefusalEvidenceSchema.optional(),
  recovery: z.strictObject({ kind: z.literal("none") }),
  remedy: SpineRemedySchema,
});
export type V3UncoveredRetirementContentRefusal = z.infer<
  typeof V3UncoveredRetirementContentRefusalSchema
>;

/** The exact selected command mode whose boundary composes a refusal remedy. */
export type V3DecomposeInvocation =
  | { mode: "preflight"; origin: string }
  | { mode: "execute"; origin: string; cutMapPath: string }
  | { mode: "extract"; origin: string; cutMapPath: string }
  | { mode: "finish-preview"; origin: string; cutMapPath: string }
  | { mode: "finish-apply"; origin: string; cutMapPath: string; applyAuthority: string }
  | { mode: "advance-base"; origin: string; cutMapPath: string };

/** Stable refusal facts and operation recovery available at a command boundary. */
export interface V3DecomposeRemedyInput {
  invocation: V3DecomposeInvocation;
  reason: string;
  locus?: string;
  recovery?: V3DecomposeOperationRecovery;
}

function invocationArgv(invocation: V3DecomposeInvocation): readonly string[] {
  switch (invocation.mode) {
    case "preflight":
      return v3DecomposePreflightArgv(invocation.origin);
    case "execute":
      return v3DecomposeExecuteArgv(invocation.origin, invocation.cutMapPath);
    case "extract":
      return v3DecomposeExtractArgv(invocation.origin, invocation.cutMapPath);
    case "finish-preview":
      return v3DecomposeFinishPreviewArgv(invocation.origin, invocation.cutMapPath);
    case "finish-apply":
      return v3DecomposeFinishApplyArgv(
        invocation.origin,
        invocation.cutMapPath,
        invocation.applyAuthority,
      );
    case "advance-base":
      return v3DecomposeAdvanceBaseArgv(invocation.origin, invocation.cutMapPath);
  }
}

function innermostReason(reason: string): string {
  return reason.split(":").at(-1) ?? reason;
}

function gitPreflightCode(reason: string): string | null {
  return /(?:^|:)git-preflight:([^:]+)$/u.exec(reason)?.[1] ?? null;
}

function preflightRemedyDefinition(reason: string): V3PreflightRemedyDefinition | undefined {
  const gitCode = gitPreflightCode(reason);
  return gitCode === null
    ? V3_PREFLIGHT_REMEDIES[innermostReason(reason)]
    : V3_GIT_PREFLIGHT_REMEDIES[gitCode];
}

function advancementNeedsCandidateCleanup(reason: string): boolean {
  const code = innermostReason(reason);
  return reason.startsWith("candidate-transform-mismatch:")
    || reason === "candidate-advancement-chain-invalid"
    || reason.startsWith("candidate-advancement-chain-invalid:")
    || code === "candidate-registration-mismatch"
    || code === "candidate-marker-mismatch"
    || code === "candidate-history-unavailable"
    || code === "candidate-initial-transition-invalid"
    || code === "candidate-advancement-base-invalid"
    || code === "dependency-recipient-drift"
    || code === "candidate-restore-failed";
}

const V3_DIRECT_MAPPED_REASONS = new Set([
  "scaffold-source-meta-incomplete",
  "scaffold-source-missing",
  "scaffold-source-invalid-encoding",
  "scaffold-title-missing",
  "existing-home-unresolvable",
  "target-artifact-absent",
  "target-locator-unresolved",
  "source-scan",
  "uncovered-retirement-content",
  "source-unpublished",
  "authoring-shape",
  "unexpected-error",
]);

/** Whether the current incremental registry owns a stable refusal code. */
export function isV3DecomposeMappedReason(reason: string): boolean {
  const code = innermostReason(reason);
  return preflightRemedyDefinition(reason) !== undefined
    || V3_DIRECT_MAPPED_REASONS.has(code)
    || advancementNeedsCandidateCleanup(reason)
    || V3_ADVANCEMENT_REMEDIES[code] !== undefined
    || V3_OPERATION_RETRY_REMEDIES[code] !== undefined
    || V3_REPOSITORY_PLAN_REMEDIES[code] !== undefined
    || V3_FINISH_REMEDIES[code] !== undefined;
}

interface V3RepositoryPlanRemedyDefinition extends V3PreflightRemedyDefinition {
  command: "preflight" | "invocation";
}

const V3_REPOSITORY_PLAN_REMEDIES: Readonly<Record<string, V3RepositoryPlanRemedyDefinition>> = {
  "unknown-destination": {
    invariant: "Every plan contribution must target one declared destination.",
    correction: "Correct the reported contribution destination, then retry the selected mode",
    command: "invocation",
  },
  "incompatible-content-role": {
    invariant: "Every plan contribution must use a content role admitted by its destination.",
    correction: "Correct the reported contribution role, then retry the selected mode",
    command: "invocation",
  },
  "incomplete-profile-artifacts": {
    invariant: "Every new member must receive the complete artifact set required by its planning profile.",
    correction: "Restore the reported profile artifact projection, then retry the selected mode",
    command: "invocation",
  },
  "allocation-projection-mismatch": {
    invariant: "Every validated allocation must project to exactly one matching content contribution.",
    correction: "Correct the reported allocation projection, then retry the selected mode",
    command: "invocation",
  },
  "dependency-projection-mismatch": {
    invariant: "Every dependency contribution must retain its validated identity and destination.",
    correction: "Correct the reported dependency projection, then retry the selected mode",
    command: "invocation",
  },
  "profile-meta-mismatch": {
    invariant: "Every new-member metadata projection must match its selected planning profile.",
    correction: "Correct the reported member metadata projection, then retry the selected mode",
    command: "invocation",
  },
  "managed-path-set-mismatch": {
    invariant: "The composed plan must claim exactly its expected managed-path set.",
    correction: "Correct the reported plan path projection, then retry the selected mode",
    command: "invocation",
  },
  "invalid-structure": {
    invariant: "A completed cut map must satisfy the closed v3 structure.",
    correction: "Correct the reported map structure, then retry the selected mode",
    command: "invocation",
  },
  "incomplete-authoring": {
    invariant: "Every required authoring slot in a completed cut map must be filled.",
    correction: "Complete the reported authoring slot, then retry the selected mode",
    command: "invocation",
  },
  "machine-order": {
    invariant: "Machine-owned map collections must retain canonical order.",
    correction: "Restore the starter map and reauthor the cut, then retry the selected mode",
    command: "invocation",
  },
  "machine-identity": {
    invariant: "Machine-owned map facts must retain their canonical identities.",
    correction: "Restore the starter map and reauthor the cut, then retry the selected mode",
    command: "invocation",
  },
  "authoring-identity": {
    invariant: "Every authored destination, allocation, and edge must reference a declared identity.",
    correction: "Correct the reported authored identity, then retry the selected mode",
    command: "invocation",
  },
  "authoring-order": {
    invariant: "Authored map collections must remain in canonical order.",
    correction: "Reorder the reported authoring collection, then retry the selected mode",
    command: "invocation",
  },
  "source-shape": {
    invariant: "Source allocations must use dispositions admitted by the selected source shape.",
    correction: "Correct the reported source disposition, then retry the selected mode",
    command: "invocation",
  },
  "companion-disposition": {
    invariant: "Extraction must preserve every non-design companion at the surviving origin.",
    correction: "Change the reported companion allocation to destination-owned retained-origin, "
      + "then retry the selected mode",
    command: "invocation",
  },
  "destination-coverage": {
    invariant: "Every declared destination must own at least one admitted contribution.",
    correction: "Add or remove the reported destination, then retry the selected mode",
    command: "invocation",
  },
  "placement-cardinality": {
    invariant: "The authored placement must agree with the number of declared destinations.",
    correction: "Correct the reported placement, then retry the selected mode",
    command: "invocation",
  },
  "shape-cardinality": {
    invariant: "The authored decomposition shape must agree with destination cardinality.",
    correction: "Correct the reported shape or destinations, then retry the selected mode",
    command: "invocation",
  },
  "invalid-meta": {
    invariant: "Source and result-base metadata must remain decodable repository records.",
    correction: "Correct the reported metadata, then re-run preflight",
    command: "preflight",
  },
  "source-meta-mismatch": {
    invariant: "The repository-plan source metadata must match the authenticated preflight path.",
    correction: "Re-run preflight and reauthor the completed map",
    command: "preflight",
  },
  "source-artifact-mismatch": {
    invariant: "Every repository-plan source artifact must match its authenticated inventory state.",
    correction: "Re-run preflight and reauthor the completed map",
    command: "preflight",
  },
  "duplicate-live-work-unit": {
    invariant: "Each live work-unit identity may appear only once during conservation.",
    correction: "Resolve the duplicate live record, then re-run preflight",
    command: "preflight",
  },
  "incoming-edge-set-changed": {
    invariant: "Incoming dependencies must match the set authenticated by preflight.",
    correction: "Re-run preflight and reauthor the dependency dispositions",
    command: "preflight",
  },
  "outgoing-edge-set-changed": {
    invariant: "Outgoing dependencies must match the set authenticated by preflight.",
    correction: "Re-run preflight and reauthor the dependency dispositions",
    command: "preflight",
  },
  "duplicate-destination-identity": {
    invariant: "Each authored destination must identify one distinct repository home.",
    correction: "Remove the duplicate destination, then retry the selected mode",
    command: "invocation",
  },
  "retiring-origin-destination": {
    invariant: "A retirement destination cannot be the origin it removes.",
    correction: "Choose a surviving destination, then retry the selected mode",
    command: "invocation",
  },
  "unknown-allocation-destination": {
    invariant: "Every source allocation must name a declared destination.",
    correction: "Correct the reported destination identity, then retry the selected mode",
    command: "invocation",
  },
  "incompatible-allocation-locator": {
    invariant: "Every allocation locator must belong to its declared destination artifact.",
    correction: "Correct the reported target locator, then retry the selected mode",
    command: "invocation",
  },
  "incompatible-source-ownership": {
    invariant: "Each allocation ownership must agree with its destination kind.",
    correction: "Correct the reported ownership, then retry the selected mode",
    command: "invocation",
  },
  "occupied-new-member": {
    invariant: "A new-member destination must not collide with a live work unit.",
    correction: "Choose an unoccupied member slug, then retry the selected mode",
    command: "invocation",
  },
  "missing-dependent": {
    invariant: "Every authenticated incoming dependent must remain live through planning.",
    correction: "Restore the dependent or re-run preflight and reauthor the cut",
    command: "preflight",
  },
  "unwritable-dependent": {
    invariant: "Every changed dependent must expose one managed writable metadata path.",
    correction: "Restore the reported dependent metadata, then retry the selected mode",
    command: "invocation",
  },
  "stale-dependent": {
    invariant: "A dependent's current targets must match the authenticated incoming edge.",
    correction: "Re-run preflight and reauthor the dependency dispositions",
    command: "preflight",
  },
  "missing-origin-slot": {
    invariant: "Every authenticated incoming dependent must still reference the origin.",
    correction: "Re-run preflight and reauthor the dependency dispositions",
    command: "preflight",
  },
  "missing-incoming-disposition": {
    invariant: "Every authenticated incoming edge must have one authored disposition.",
    correction: "Author the missing incoming disposition, then retry the selected mode",
    command: "invocation",
  },
  "missing-outgoing-disposition": {
    invariant: "Every authenticated outgoing edge must have one authored disposition.",
    correction: "Author the missing outgoing disposition, then retry the selected mode",
    command: "invocation",
  },
  "origin-reference-remains": {
    invariant: "Retirement must remove every dependency reference to the retiring origin.",
    correction: "Replace or drop the reported origin reference, then retry the selected mode",
    command: "invocation",
  },
  "unknown-dependency-recipient": {
    invariant: "Every dependency contribution must target a declared writable recipient.",
    correction: "Correct the reported dependency recipient, then retry the selected mode",
    command: "invocation",
  },
  "unknown-internal-dependent": {
    invariant: "Every internal-edge dependent must be a declared new member.",
    correction: "Correct the reported internal edge, then retry the selected mode",
    command: "invocation",
  },
  "unknown-internal-prerequisite": {
    invariant: "Every internal-edge prerequisite must be a declared new member.",
    correction: "Correct the reported internal edge, then retry the selected mode",
    command: "invocation",
  },
  "self-dependency": {
    invariant: "An authored internal dependency cannot target its own dependent.",
    correction: "Remove the self-dependency, then retry the selected mode",
    command: "invocation",
  },
  "unknown-external-target": {
    invariant: "Every authored external dependency must target a live or completed work unit.",
    correction: "Choose an eligible external target, then retry the selected mode",
    command: "invocation",
  },
  "redundant-external-edge": {
    invariant: "Dependencies between declared destinations must use their destination-owned authoring slot.",
    correction: "Move the edge to internalEdges or its incoming or outgoing disposition, then retry",
    command: "invocation",
  },
  "retiring-origin-target": {
    invariant: "A retirement external dependency cannot target the origin it removes.",
    correction: "Choose a surviving external target or remove the edge, then retry",
    command: "invocation",
  },
  "unchanged-dependency-slot": {
    invariant: "An authored dependency disposition must change its authenticated slot.",
    correction: "Remove or correct the redundant disposition, then retry the selected mode",
    command: "invocation",
  },
  "source-kind": {
    invariant: "Retirement requires a retiring source kind rather than a surviving Active origin.",
    correction: "Use extraction authoring for a surviving origin, then retry",
    command: "invocation",
  },
  "missing-merge-base": {
    invariant: "Source and result-base history must have one merge base.",
    correction: "Restore a shared history, then re-run preflight",
    command: "preflight",
  },
  "ambiguous-merge-base": {
    invariant: "Source and result-base history must have exactly one merge base.",
    correction: "Resolve the ambiguous history, then re-run preflight",
    command: "preflight",
  },
  "invalid-tree-path": {
    invariant: "Every retirement path must be a managed repository path.",
    correction: "Correct the reported repository path, then retry the selected mode",
    command: "invocation",
  },
  "ambiguous-predecessor": {
    invariant: "Retirement must resolve exactly one result-base predecessor.",
    correction: "Resolve the predecessor records, then re-run preflight",
    command: "preflight",
  },
  "predecessor-missing": {
    invariant: "The authenticated result-base predecessor must remain present.",
    correction: "Restore the predecessor or re-run preflight and reauthor the cut",
    command: "preflight",
  },
  "predecessor-changed": {
    invariant: "The result-base predecessor must match the earlier authenticated tree state.",
    correction: "Re-run preflight and reauthor the completed map",
    command: "preflight",
  },
  "predecessor-absent-from-source": {
    invariant: "A started source must contain the predecessor artifact it retires.",
    correction: "Restore the source artifact, then re-run preflight",
    command: "preflight",
  },
  "backlog-predecessor-changed": {
    invariant: "A backlog predecessor must be unchanged between base and source trees.",
    correction: "Re-run preflight and reauthor the completed map",
    command: "preflight",
  },
  "origin-artifact-missing": {
    invariant: "Every authenticated origin artifact must remain present in the source tree.",
    correction: "Restore the source artifact, then re-run preflight",
    command: "preflight",
  },
  "unexpected-object-kind": {
    invariant: "Retirement paths must remain regular Git blobs.",
    correction: "Restore the reported regular file, then re-run preflight",
    command: "preflight",
  },
  "unexpected-mode": {
    invariant: "Retirement paths must retain a supported regular-file mode.",
    correction: "Correct the reported file mode, then re-run preflight",
    command: "preflight",
  },
  "git-read-failed": {
    invariant: "Retirement planning must read every pinned Git tree state.",
    correction: "Repair the reported Git read, then retry the selected mode",
    command: "invocation",
  },
  "source-private-added": {
    invariant: "Retirement cannot silently remove a source-private added path.",
    correction: "Preserve or remove the reported rider deliberately, then re-run preflight",
    command: "preflight",
  },
  "source-private-modified": {
    invariant: "Retirement cannot silently remove a source-private modified path.",
    correction: "Preserve or restore the reported rider, then re-run preflight",
    command: "preflight",
  },
  "source-private-deleted": {
    invariant: "Retirement cannot silently preserve a source-private deletion mismatch.",
    correction: "Reconcile the reported rider, then re-run preflight",
    command: "preflight",
  },
  "source-rider": {
    invariant: "Every source-private retirement rider must have a stable disposition.",
    correction: "Resolve the reported rider, then re-run preflight",
    command: "preflight",
  },
  "no-new-member": {
    invariant: "A decomposition topology must introduce at least one new member.",
    correction: "Author a new-member destination, then retry the selected mode",
    command: "invocation",
  },
  "multi-member-cohortless": {
    invariant: "Multiple new members require an authored cohort placement.",
    correction: "Author a cohort placement, then retry the selected mode",
    command: "invocation",
  },
  "placement-member-count": {
    invariant: "A cohort placement must contain enough constituents to form a cohort.",
    correction: "Correct the placement or destinations, then retry the selected mode",
    command: "invocation",
  },
  "unexpected-coordination-location": {
    invariant: "Coordination destinations must agree with the authored topology placement.",
    correction: "Correct the coordination destination, then retry the selected mode",
    command: "invocation",
  },
  "missing-parent": {
    invariant: "A subcohort placement requires its parent cohort document.",
    correction: "Restore the parent cohort, then retry the selected mode",
    command: "invocation",
  },
  "nonregular-topology-path": {
    invariant: "Every existing topology document must be a supported regular file.",
    correction: "Restore the reported topology file, then retry the selected mode",
    command: "invocation",
  },
  "invalid-topology-utf8": {
    invariant: "Every existing topology document must be valid UTF-8.",
    correction: "Convert the reported topology file to UTF-8, then retry the selected mode",
    command: "invocation",
  },
  "wrong-structural-identity": {
    invariant: "An existing topology document must carry the identity implied by its path.",
    correction: "Correct the reported topology identity, then retry the selected mode",
    command: "invocation",
  },
  "invalid-cohort-template": {
    invariant: "The bundled cohort template must be available as valid UTF-8.",
    correction: "Restore the cohort template, then retry the selected mode",
    command: "invocation",
  },
  "conflicting-at-cap-provenance": {
    invariant: "An at-cap parent may contain only one compatible provenance block.",
    correction: "Resolve the reported provenance block, then retry the selected mode",
    command: "invocation",
  },
  "dependency-projection-failed": {
    invariant: "Every validated dependency edit must project to one repository mutation.",
    correction: "Correct the reported dependency projection, then retry the selected mode",
    command: "invocation",
  },
  "roadmap-missing": {
    invariant: "Repository-plan composition requires one regular ROADMAP document.",
    correction: "Restore the ROADMAP, then retry the selected mode",
    command: "invocation",
  },
  "roadmap-render-failed": {
    invariant: "The projected repository tree must render one ROADMAP view.",
    correction: "Correct the reported ROADMAP render failure, then retry the selected mode",
    command: "invocation",
  },
  "roadmap-plan-identity-mismatch": {
    invariant: "ROADMAP rendering must not change the immutable repository-plan identity.",
    correction: "Correct the projected plan, then retry the selected mode",
    command: "invocation",
  },
  "invalid-plan-operand": {
    invariant: "Plan composition requires complete, internally consistent operands.",
    correction: "Correct the reported plan operand, then retry the selected mode",
    command: "invocation",
  },
  "invalid-managed-path": {
    invariant: "Every planned mutation must target a managed repository path.",
    correction: "Correct the reported mutation path, then retry the selected mode",
    command: "invocation",
  },
  "unsupported-path-state": {
    invariant: "Every planned path state must be absent or a supported regular file.",
    correction: "Correct the reported path state, then retry the selected mode",
    command: "invocation",
  },
  "incompatible-base-prestate": {
    invariant: "Every contributor to one path must agree on the authenticated base prestate.",
    correction: "Correct the reported contribution, then retry the selected mode",
    command: "invocation",
  },
  "exclusive-role-collision": {
    invariant: "An exclusive retirement or ROADMAP path may have only one owner.",
    correction: "Remove the conflicting path claim, then retry the selected mode",
    command: "invocation",
  },
  "duplicate-role-owner": {
    invariant: "Each path role may have only one contributing owner.",
    correction: "Remove the duplicate role owner, then retry the selected mode",
    command: "invocation",
  },
  "duplicate-whole-file-owner": {
    invariant: "A composed path may have only one whole-file content owner.",
    correction: "Remove the duplicate whole-file owner, then retry the selected mode",
    command: "invocation",
  },
  "incompatible-mode-transition": {
    invariant: "Every path mutation must retain a compatible regular-file mode transition.",
    correction: "Correct the reported path mode, then retry the selected mode",
    command: "invocation",
  },
  "contributor-prestate-discontinuity": {
    invariant: "Ordered contributors must form one continuous path-state chain.",
    correction: "Correct the reported contributor sequence, then retry the selected mode",
    command: "invocation",
  },
  "tree-read-failed": {
    invariant: "Repository planning must read the complete pinned source, merge-base, and result trees.",
    correction: "Repair the reported Git tree read, then retry the selected mode",
    command: "invocation",
  },
  "repository-plan-failed": {
    invariant: "Repository-plan composition must complete without an adapter failure.",
    correction: "Correct the reported adapter failure, then retry the selected mode",
    command: "invocation",
  },
};

const V3_ADVANCEMENT_REMEDIES: Readonly<Record<string, V3RepositoryPlanRemedyDefinition>> = {
  "full-protection-required": {
    invariant: "Base advancement requires full branch protection and its deterministic candidate worktree.",
    correction: "Enable full branch protection, then retry base advancement",
    command: "invocation",
  },
  "invalid": {
    invariant: "Base advancement requires one valid completed map for the invoked origin.",
    correction: "Correct the completed map, then retry base advancement",
    command: "invocation",
  },
  "base-not-descendant": {
    invariant: "The live result base must descend from the decomposition plan's authenticated base.",
    correction: "Land or select a descendant base, then retry base advancement",
    command: "invocation",
  },
  "base-ancestry-unavailable": {
    invariant: "Base advancement must determine every authenticated and recorded base ancestry relation.",
    correction: "Restore the reported Git ancestry probe, then retry base advancement",
    command: "invocation",
  },
  "candidate-topology-unavailable": {
    invariant: "Base advancement must read the registered candidate-worktree topology.",
    correction: "Restore the worktree registry, then retry base advancement",
    command: "invocation",
  },
  "binding-unavailable": {
    invariant: "Base advancement must resolve the candidate and configured base to exact commits.",
    correction: "Restore the reported ref binding, then retry base advancement",
    command: "invocation",
  },
  "candidate-dirty": {
    invariant: "The decomposition candidate must be clean before base advancement.",
    correction: "Clean the candidate worktree, then retry base advancement",
    command: "invocation",
  },
  "base-dependency-snapshot-unavailable": {
    invariant: "Base advancement must read the live base dependency snapshot.",
    correction: "Restore the live dependency records, then retry base advancement",
    command: "invocation",
  },
  "base-acquired-incoming-dependency": {
    invariant: "The origin's incoming dependency set must remain identical to the completed map.",
    correction: "Re-run preflight and reauthor the completed map",
    command: "preflight",
  },
  "dependency-recipient-drift": {
    invariant: "A dependency-bearing recipient must retain its last authenticated base dependency set.",
    correction: "Clean the candidate, then re-run preflight and recreate it",
    command: "preflight",
  },
  "binding-raced": {
    invariant: "The candidate and configured base refs must remain at their authenticated commits.",
    correction: "Stabilize the reported ref, then retry base advancement",
    command: "invocation",
  },
  "merge-refused": {
    invariant: "The configured base must merge cleanly into the decomposition candidate.",
    correction: "Resolve the reported base conflict, then retry base advancement",
    command: "invocation",
  },
  "changed-paths-unavailable": {
    invariant: "Base advancement must read the candidate's exact changed-path set.",
    correction: "Restore the candidate comparison, then retry base advancement",
    command: "invocation",
  },
  "changed-paths": {
    invariant: "The advanced candidate must change exactly the composed plan paths.",
    correction: "Restore the reported path set, then retry base advancement",
    command: "invocation",
  },
  "path-state": {
    invariant: "Every advanced candidate path must match its composed final state.",
    correction: "Restore the reported path state, then retry base advancement",
    command: "invocation",
  },
  "transition-record": {
    invariant: "The advanced candidate must retain the exact decomposition transition record.",
    correction: "Restore the reported transition record, then retry base advancement",
    command: "invocation",
  },
  "blob-unavailable": {
    invariant: "Every advancement-plan file must retain its content-addressed blob.",
    correction: "Restore the reported plan blob, then retry base advancement",
    command: "invocation",
  },
  "write-failed": {
    invariant: "Every advancement-plan mutation must write and stage successfully.",
    correction: "Correct the reported write failure, then retry base advancement",
    command: "invocation",
  },
};

function recoveryRemedy(input: V3DecomposeRemedyInput): SpineRemedy | null {
  if (input.recovery?.kind === "full-candidate") {
    return spineRemedy(
      "A decomposition candidate that cannot continue must be cleaned through its owned branch.",
      `Clean the candidate at ${input.recovery.path}, then retry with ${
        renderV3DecomposeArgv(invocationArgv(input.invocation))
      }`,
      ["arc", "teardown", "--branch", input.recovery.candidateBranch],
    );
  }
  if (input.recovery?.kind !== "partial-restoration") return null;
  const paths = input.recovery.status === "restored"
    ? input.recovery.restoredPaths
    : input.recovery.affectedPaths;
  return spineRemedy(
    input.recovery.status === "restored"
      ? "Every transform-owned partial mutation was restored to its captured preimage."
      : "Every transform-owned partial mutation must restore to its captured preimage.",
    input.recovery.status === "restored"
      ? "Retry the selected mode"
      : `Restore the reported paths (${paths.join(", ")}), then retry the selected mode`,
    invocationArgv(input.invocation),
  );
}

function advancementCleanupRemedy(
  input: V3DecomposeRemedyInput,
  code: string,
): SpineRemedy | null {
  if (input.invocation.mode !== "advance-base"
    || !advancementNeedsCandidateCleanup(input.reason)) return null;
  const locus = input.locus ?? "the deterministic candidate worktree";
  const mismatchDefinition = V3_ADVANCEMENT_REMEDIES[code];
  return spineRemedy(
    code === "candidate-restore-failed"
      ? "A refused base advancement must restore its candidate to the authenticated head."
      : mismatchDefinition?.invariant
        ?? "A decomposition candidate that cannot advance must be cleaned through its deterministic branch.",
    code === "dependency-recipient-drift"
      ? `Clean the stale candidate at ${locus}, then run ${
          renderV3DecomposeArgv(v3DecomposePreflightArgv(input.invocation.origin))
        } and recreate it`
      : `Clean the stranded candidate at ${locus}, then retry with ${
          renderV3DecomposeArgv(invocationArgv(input.invocation))
        }`,
    ["arc", "teardown", "--branch", decomposeCandidateBranch(input.invocation.origin)],
  );
}

function sourceRouteRemedy(
  input: V3DecomposeRemedyInput,
  code: string,
): SpineRemedy | null {
  if (code === "source-unpublished") {
    const branch = input.locus ?? input.invocation.origin;
    const ref = `refs/heads/${branch}`;
    return spineRemedy(
      "A branch-backed source must be published at its authenticated commit before mutation.",
      "Publish the reported source branch, then retry the selected mode",
      ["git", "push", "origin", `${ref}:${ref}`],
    );
  }
  if (code !== "authoring-shape" || input.invocation.mode === "preflight") return null;
  if (input.invocation.mode === "execute" || input.invocation.mode === "advance-base") {
    return spineRemedy(
      "An extraction-shaped map must run through extraction mode.",
      "Run the completed map through extraction mode",
      v3DecomposeExtractArgv(input.invocation.origin, input.invocation.cutMapPath),
    );
  }
  return spineRemedy(
    "A retirement-shaped map must run through execute mode.",
    "Run the completed map through retirement execute mode",
    v3DecomposeExecuteArgv(input.invocation.origin, input.invocation.cutMapPath),
  );
}

function scaffoldRemedy(
  input: V3DecomposeRemedyInput,
  code: string,
): SpineRemedy | null {
  const preflightArgv = v3DecomposePreflightArgv(input.invocation.origin);
  switch (code) {
    case "scaffold-source-meta-incomplete": {
      const source = input.locus ?? "the reported member and source metadata";
      return spineRemedy(
        "Every new-member scaffold requires complete source metadata.",
        `Set the owner, priority, and origin fields at ${source}, then re-run preflight`,
        preflightArgv,
      );
    }
    case "scaffold-source-missing": {
      const source = input.locus ?? "the reported member and source artifact";
      return spineRemedy(
        "Every requested member scaffold must have a regular-file source artifact.",
        `Restore the scaffold source at ${source}, then re-run preflight`,
        preflightArgv,
      );
    }
    case "scaffold-source-invalid-encoding": {
      const source = input.locus ?? "the reported member and source artifact";
      return spineRemedy(
        "Every scaffold source artifact must be valid UTF-8.",
        `Convert ${source} to UTF-8, then re-run preflight`,
        preflightArgv,
      );
    }
    case "scaffold-title-missing": {
      const source = input.locus ?? "the reported member and source artifact";
      return spineRemedy(
        "Every scaffold source artifact must open with a title line.",
        `Add a title line at ${source}, then re-run preflight`,
        preflightArgv,
      );
    }
    case "existing-home-unresolvable": {
      const target = input.locus ?? "the reported existing home";
      return spineRemedy(
        "Every existing-home destination must resolve to a regular file.",
        `Restore the regular-file existing home at ${target}, then re-run preflight`,
        preflightArgv,
      );
    }
    default:
      return null;
  }
}

function targetAndContentRemedy(
  input: V3DecomposeRemedyInput,
  code: string,
): SpineRemedy | null {
  if (code === "target-artifact-absent" || code === "target-locator-unresolved") {
    const target = input.locus ?? "the reported destination and target artifact";
    return code === "target-artifact-absent"
      ? spineRemedy(
          "Every target artifact must exist in the projected destination tree.",
          `Correct the map allocation for ${target}, then retry the selected mode`,
          invocationArgv(input.invocation),
        )
      : spineRemedy(
          "Every authored target locator must resolve exactly once in the projected artifact.",
          `Correct the target locator for ${target}, then retry the selected mode`,
          invocationArgv(input.invocation),
        );
  }
  if (code === "unexpected-error") {
    return spineRemedy(
      "The selected decomposition mode must complete without an unexpected runtime failure.",
      "Retry the selected mode",
      invocationArgv(input.invocation),
    );
  }
  if (code === "source-scan") {
    const sourcePath = input.locus ?? "the reported source artifact";
    return spineRemedy(
      "Every scanned Markdown source artifact must be valid UTF-8.",
      `Convert ${sourcePath} to UTF-8, then re-run preflight`,
      v3DecomposePreflightArgv(input.invocation.origin),
    );
  }
  if (code !== "uncovered-retirement-content") return null;
  const companion = input.locus ?? "the reported companion";
  return spineRemedy(
    "Retirement cannot delete nonempty companion content outside the conservation proof.",
    `Move the content at ${companion} into a scanned artifact or delete the file, then re-run preflight`,
    v3DecomposePreflightArgv(input.invocation.origin),
  );
}

function registeredRemedy(input: V3DecomposeRemedyInput, code: string): SpineRemedy {
  const advancementDefinition = input.invocation.mode === "advance-base"
    ? V3_ADVANCEMENT_REMEDIES[code]
    : undefined;
  if (advancementDefinition !== undefined) {
    return spineRemedy(
      advancementDefinition.invariant,
      advancementDefinition.correction,
      advancementDefinition.command === "preflight"
        ? v3DecomposePreflightArgv(input.invocation.origin)
        : invocationArgv(input.invocation),
    );
  }
  const operationDefinition = V3_OPERATION_RETRY_REMEDIES[code];
  if (operationDefinition !== undefined) {
    const requiresPreflight = code === "source-ref-moved"
      || code === "result-ref-moved"
      || code === "extraction-facts-missing";
    return spineRemedy(
      operationDefinition.invariant,
      operationDefinition.correction,
      requiresPreflight
        ? v3DecomposePreflightArgv(input.invocation.origin)
        : invocationArgv(input.invocation),
    );
  }
  const repositoryDefinition = V3_REPOSITORY_PLAN_REMEDIES[code];
  if (repositoryDefinition !== undefined) {
    return spineRemedy(
      repositoryDefinition.invariant,
      repositoryDefinition.correction,
      repositoryDefinition.command === "preflight"
        ? v3DecomposePreflightArgv(input.invocation.origin)
        : invocationArgv(input.invocation),
    );
  }
  const finishDefinition = V3_FINISH_REMEDIES[code];
  if (finishDefinition !== undefined) {
    return spineRemedy(
      finishDefinition.invariant,
      finishDefinition.correction,
      invocationArgv(input.invocation),
    );
  }
  throw new Error(`No decomposition remedy is registered for ${input.reason}.`);
}

/** Map one stable decomposition refusal to its command-boundary remedy. */
export function v3DecomposeRemedy(input: V3DecomposeRemedyInput): SpineRemedy {
  const code = innermostReason(input.reason);
  const recovery = recoveryRemedy(input);
  if (recovery !== null) return recovery;
  const cleanup = advancementCleanupRemedy(input, code);
  if (cleanup !== null) return cleanup;
  const preflightDefinition = preflightRemedyDefinition(input.reason);
  if (preflightDefinition !== undefined) {
    return spineRemedy(
      preflightDefinition.invariant,
      preflightDefinition.correction,
      v3DecomposePreflightArgv(input.invocation.origin),
    );
  }
  const sourceRoute = sourceRouteRemedy(input, code);
  if (sourceRoute !== null) return sourceRoute;
  const scaffold = scaffoldRemedy(input, code);
  if (scaffold !== null) return scaffold;
  const targetOrContent = targetAndContentRemedy(input, code);
  if (targetOrContent !== null) return targetOrContent;
  return registeredRemedy(input, code);
}
