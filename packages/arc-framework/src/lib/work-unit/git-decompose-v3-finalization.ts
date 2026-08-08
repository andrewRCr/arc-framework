/** Repository-bound finalization of one prepared decomposition candidate. */

import { basename } from "node:path";
import { readFile, rm } from "node:fs/promises";

import {
  metaCohortField,
  cohortDocLocation,
  type BacklogFile,
  type CohortConsistencyInput,
} from "../active/cohort-consistency.js";
import {
  canonicalize,
  digestBytes,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { validateManagedPath } from "../canonical/managed-path.js";
import type { GitExec } from "../git/exec.js";
import { readGitBlobBytes } from "../io-context.js";
import {
  composeProjectReadinessViewResult,
  resolveProjectReadinessComposition,
  type ProjectReadinessCompositionResult,
} from "../status/project-view.js";
import { decomposeReadinessDeps } from "./decompose-launch-readiness.js";
import {
  revalidateV3DecomposeCutMapBinding,
} from "./decompose-v3-preflight.js";
import {
  createV3DecomposeFinalizationRecoveryFacts,
  mapV3DecomposeFinalizationRecovery,
  renderV3DecomposeFinalizationRecovery,
  type V3DecomposeFinalizationRecoveryCause,
  type V3DecomposeRecoveryFacts,
} from "./decompose-finalization-recovery.js";
import {
  createInRepoDecomposeRetirementDriver,
  type FinalizeV3DecomposeDriverResult,
} from "./decompose-retirement-driver.js";
import type { V3RepositoryPlanTree } from "./decompose-v3-repository-plan.js";
import type { ValidateV3DecomposeTopologyInput } from "./decompose-topology-validation.js";
import {
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import { parseV3DecomposeReceipt } from "./decompose-v3-receipt.js";
import {
  createGitV3RepositoryTreeProjectViewFs,
  readGitV3RepositoryTree,
  type GitV3RepositoryPlanDependencies,
} from "./git-decompose-v3-repository-plan.js";
import { createGitV3DecomposePreflight } from "./git-decompose-v3-preflight.js";
import {
  resolveRetirementRecordPath,
  writeRetirementRecord,
} from "./retirement-record-store.js";

export type GitV3DecomposeFinalizationDependencies =
  GitV3RepositoryPlanDependencies;

export interface GitV3DecomposeFinalizationInput {
  baseBranch: string;
  origin: string;
  receiptId: string;
  continuationPath: string;
}

export type GitV3DecomposeFinalizationResult =
  | Exclude<FinalizeV3DecomposeDriverResult, { status: "refused" }>
  | (Extract<FinalizeV3DecomposeDriverResult, { status: "refused" }> & {
      remedy: string;
    });

function bindGitCwd(exec: GitExec, cwd: string): GitExec {
  return async (command, args, options) => await exec(command, args, {
    ...options,
    cwd: options?.cwd ?? cwd,
  });
}

function refusal(
  input: GitV3DecomposeFinalizationInput,
  reason: string,
  cause: V3DecomposeFinalizationRecoveryCause,
): GitV3DecomposeFinalizationResult {
  const facts: V3DecomposeRecoveryFacts = createV3DecomposeFinalizationRecoveryFacts(
    input.origin,
    input.receiptId,
    input.continuationPath,
  );
  const recovery = mapV3DecomposeFinalizationRecovery({ cause, facts });
  return {
    status: "refused",
    reason,
    recovery,
    remedy: renderV3DecomposeFinalizationRecovery(recovery),
  };
}

function preparedRecord(
  input: unknown,
  receiptId: CanonicalDigest,
): V3DecomposePreparation | null {
  const direct = parseV3DecomposePreparation(input);
  if (direct !== null && direct.receiptId === receiptId) return direct;
  const receipt = parseV3DecomposeReceipt(input);
  return receipt === null || receipt.receiptId !== receiptId
    ? null
    : parseV3DecomposePreparation({
        kind: "prepared-decompose",
        schemaVersion: 3,
        receiptId: receipt.receiptId,
        preparationId: receipt.preparationId,
        facts: receipt.prepared,
      });
}

async function resolveCommit(
  dependencies: GitV3DecomposeFinalizationDependencies,
  ref: string,
): Promise<string | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["rev-parse", "--verify", `${ref}^{commit}`],
      { cwd: dependencies.cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function resolveCurrentBranch(
  dependencies: GitV3DecomposeFinalizationDependencies,
): Promise<string | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      { cwd: dependencies.cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function writeTree(
  dependencies: GitV3DecomposeFinalizationDependencies,
): Promise<string> {
  const { stdout } = await dependencies.exec(
    "git",
    ["write-tree"],
    { cwd: dependencies.cwd },
  );
  const oid = stdout.trim();
  if (!/^[0-9a-f]{40,64}$/u.test(oid)) throw new Error("Git did not produce an index tree.");
  return oid;
}

async function shortRef(
  dependencies: GitV3DecomposeFinalizationDependencies,
  oid: string,
): Promise<string> {
  const { stdout } = await dependencies.exec(
    "git",
    ["rev-parse", "--short", oid],
    { cwd: dependencies.cwd },
  );
  return stdout.trim() || oid;
}

function textFiles(tree: V3RepositoryPlanTree): BacklogFile[] {
  const files: BacklogFile[] = [];
  for (const [path, state] of Object.entries(tree)) {
    if (state.kind === "absent" || state.objectKind !== "blob"
      || (state.mode !== "100644" && state.mode !== "100755")) continue;
    try {
      files.push({
        path,
        content: new TextDecoder("utf-8", { fatal: true }).decode(state.bytes),
      });
    } catch {
      // Non-text blobs are irrelevant to meta/cohort topology validation.
    }
  }
  return files;
}

function topologyTree(
  tree: V3RepositoryPlanTree,
): ValidateV3DecomposeTopologyInput["candidateTree"] {
  const projected: ValidateV3DecomposeTopologyInput["candidateTree"] = {};
  for (const [path, state] of Object.entries(tree)) {
    if (state.kind !== "absent") projected[path] = state;
  }
  return projected;
}

function cohortConsistency(tree: V3RepositoryPlanTree): CohortConsistencyInput {
  const files = textFiles(tree);
  const metas = files.filter(({ path }) =>
    path.startsWith(".arc/backlog/planned/") && /(?:^|\/)meta-[^/]+\.md$/u.test(path));
  const cohortDocs = files.filter(({ path }) =>
    path.startsWith(".arc/backlog/planned/") && /(?:^|\/)cohort-[^/]+\.md$/u.test(path));
  const liveMembersByDir = new Map<string, Set<string>>();
  for (const meta of files.filter(({ path }) => /(?:^|\/)meta-[^/]+\.md$/u.test(path))) {
    const cohort = metaCohortField(meta.content);
    const slug = /^meta-(.+)\.md$/u.exec(basename(meta.path))?.[1];
    if (cohort === "" || slug === undefined) continue;
    const members = liveMembersByDir.get(cohort) ?? new Set<string>();
    members.add(slug);
    liveMembersByDir.set(cohort, members);
  }
  const existingCohortDocDirs = new Set(
    cohortDocs.flatMap((doc) => {
      const location = cohortDocLocation(doc.path);
      return location === null ? [] : [location.cohortDir];
    }),
  );
  return { metas, cohortDocs, liveMembersByDir, existingCohortDocDirs };
}

function compositionFacts(composition: ProjectReadinessCompositionResult): unknown {
  return {
    acceptedCandidates: composition.acceptedCandidates,
    rejectedRecords: composition.rejectedRecords,
    records: composition.records,
    treeRecords: composition.treeRecords,
    derivationWarnings: composition.derivationWarnings,
    sourceWarnings: composition.sourceWarnings,
    indeterminate: composition.indeterminate,
    view: composition.view,
  };
}

async function resolveComposition(
  dependencies: GitV3DecomposeFinalizationDependencies,
  baseBranch: string,
  tree: V3RepositoryPlanTree,
  overlay: { origin: string; sourceBranch: string },
  title: string,
): Promise<ProjectReadinessCompositionResult> {
  return await resolveProjectReadinessComposition({
    cwd: dependencies.cwd,
    title,
    fs: createGitV3RepositoryTreeProjectViewFs(dependencies.cwd, tree),
    localRefs: {
      exec: bindGitCwd(dependencies.exec, dependencies.cwd),
      acquisitionPolicy: "local",
      baseBranch,
      decompositionClaimCwd: dependencies.cwd,
    },
    transitionOverlay: overlay,
  });
}

function roadmapTitle(preparation: V3DecomposePreparation, tree: V3RepositoryPlanTree): string | null {
  const state = tree[preparation.facts.prospectiveProjection.roadmap.path];
  if (state === undefined || state.kind === "absent" || state.objectKind !== "blob") return null;
  try {
    const first = new TextDecoder("utf-8", { fatal: true }).decode(state.bytes)
      .split(/\r?\n/u)[0];
    const match = /^# (.+)$/u.exec(first ?? "");
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function roadmapMismatch(
  preparation: V3DecomposePreparation,
  tree: V3RepositoryPlanTree,
  composition: ProjectReadinessCompositionResult,
  renderedRef: string,
): string | null {
  const expected = preparation.facts.prospectiveProjection.roadmap.after;
  const path = preparation.facts.prospectiveProjection.roadmap.path;
  const state = tree[path];
  if (expected.kind !== "file") return "prepared-roadmap-state";
  if (state === undefined
    || state.kind === "absent"
    || state.objectKind !== "blob"
    || state.mode !== expected.mode
    || digestBytes(state.bytes) !== expected.contentDigest) return "candidate-roadmap-state";
  const rendered = composeProjectReadinessViewResult({
    ...composition.view,
    renderedRef: {
      ref: renderedRef,
      scope: "tree + local refs",
      liveView: "arc status --project",
    },
  }).markdown;
  const bytes = new TextEncoder().encode(rendered.endsWith("\n") ? rendered : `${rendered}\n`);
  return digestBytes(bytes) === expected.contentDigest
    && Buffer.from(bytes).equals(Buffer.from(state.bytes))
    ? null
    : "rendered-roadmap-state";
}

/**
 * Finalize one exact prepared candidate with a canonical continuation file.
 *
 * @param dependencies - Pinned Git tree/object readers and canonical cohort template.
 * @param input - Configured base, exact origin/receipt, and continuation path.
 * @returns Canonical finalization result with pre-rendered refusal recovery.
 */
export async function finalizeGitV3DecomposeOperation(
  dependencies: GitV3DecomposeFinalizationDependencies,
  input: GitV3DecomposeFinalizationInput,
): Promise<GitV3DecomposeFinalizationResult> {
  if (!isCanonicalDigest(input.receiptId)) {
    return refusal(input, "invalid receipt ID", {
      kind: "manual-guidance",
      message: "Supply the canonical receipt ID reported by the decomposition operation.",
    });
  }
  const receiptId = input.receiptId;
  let storedText: string;
  try {
    storedText = await readFile(resolveRetirementRecordPath(dependencies.cwd, receiptId), "utf8");
  } catch {
    return refusal(input, "evidence-missing", { kind: "mechanical-repreflight" });
  }
  const preparation = preparedRecord(storedText, receiptId);
  if (preparation === null
    || preparation.facts.completedMap.machine.source.origin !== input.origin) {
    return refusal(input, "evidence-mismatch", { kind: "mechanical-repreflight" });
  }

  try {
    const [candidateHead, currentBranch, indexTree] = await Promise.all([
      resolveCommit(dependencies, "HEAD"),
      resolveCurrentBranch(dependencies),
      writeTree(dependencies),
    ]);
    const ownership = preparation.facts.candidateOwnership;
    const expectedBranch = ownership.kind === "claimed"
      ? ownership.candidateBranch
      : input.baseBranch;
    if (candidateHead !== preparation.facts.completedMap.machine.resultBase.head
      || currentBranch !== expectedBranch) {
      return refusal(input, "candidate-locus-mismatch", {
        kind: "manual-guidance",
        message: "Run finalization from the exact prepared candidate checkout.",
      });
    }
    const tree = await readGitV3RepositoryTree(dependencies, indexTree);
    if (tree === null || await writeTree(dependencies) !== indexTree) {
      return refusal(input, "candidate-tree-moved", { kind: "transient-finalization" });
    }
    const prospectiveOverlay = preparation.facts.prospectiveProjection.overlay;
    const title = roadmapTitle(preparation, tree);
    if (title === null) {
      return refusal(input, "prospective-projection-mismatch:roadmap-title", {
        kind: "semantic-reauthorization",
      });
    }
    const [composition, renderedRef] = await Promise.all([
      resolveComposition(
        dependencies,
        input.baseBranch,
        tree,
        prospectiveOverlay,
        title,
      ),
      shortRef(dependencies, preparation.facts.completedMap.machine.resultBase.head),
    ]);
    const roadmapIssue = roadmapMismatch(preparation, tree, composition, renderedRef);
    if (roadmapIssue !== null) {
      return refusal(input, `prospective-projection-mismatch:${roadmapIssue}`, {
        kind: "semantic-reauthorization",
      });
    }
    let continuation: unknown = null;
    try {
      const text = await readFile(input.continuationPath, "utf8");
      const parsed: unknown = JSON.parse(text);
      if (text === `${canonicalize(parsed)}\n`) continuation = parsed;
    } catch {
      // The canonical driver maps an invalid continuation to exact reauthoring recovery.
    }
    const refreshed = await createGitV3DecomposePreflight({
      cwd: dependencies.cwd,
      exec: dependencies.exec,
      readBlob: (ref, path) => dependencies.readBlob(ref, path),
    }, input.baseBranch, input.origin);
    if (refreshed.status !== "ready") {
      return refusal(input, refreshed.reason, { kind: "mechanical-repreflight" });
    }
    const sourceBinding = revalidateV3DecomposeCutMapBinding(
      preparation.facts.completedMap,
      refreshed.preflight,
    );
    if (sourceBinding.status !== "current") {
      return refusal(input, sourceBinding.reason, { kind: "mechanical-repreflight" });
    }
    const driver = createInRepoDecomposeRetirementDriver({
      cwd: dependencies.cwd,
      exec: dependencies.exec,
      readFile: async (path) => await readFile(path, "utf8"),
      readBlob: async (ref, path) =>
        await readGitBlobBytes(dependencies.cwd, ref, validateManagedPath(path)),
      createRecord: async (selectedReceiptId, content) => {
        await writeRetirementRecord(dependencies.cwd, selectedReceiptId, content);
      },
      removeRecord: async (selectedReceiptId) => {
        await rm(resolveRetirementRecordPath(dependencies.cwd, selectedReceiptId));
      },
      readTopologyValidationInput: async (selectedPreparation) => {
        if (canonicalize(selectedPreparation) !== canonicalize(preparation)
          || await writeTree(dependencies) !== indexTree) {
          throw new Error("candidate topology tree moved");
        }
        return {
          candidateTree: topologyTree(tree),
          cohortTemplate: dependencies.cohortTemplate,
          cohortConsistency: cohortConsistency(tree),
        };
      },
      validateProspectiveProjection: async (selectedPreparation, overlay) => {
        if (canonicalize(selectedPreparation) !== canonicalize(preparation)
          || await writeTree(dependencies) !== indexTree) return false;
        const validated = await resolveComposition(
          dependencies,
          input.baseBranch,
          tree,
          overlay,
          title,
        );
        return canonicalize(compositionFacts(validated))
            === canonicalize(compositionFacts(composition))
          && roadmapMismatch(selectedPreparation, tree, validated, renderedRef) === null;
      },
    });
    const result = await driver.finalizeV3(input.origin, receiptId, {
      continuation,
      continuationPath: input.continuationPath,
      composition,
      readinessDeps: decomposeReadinessDeps,
      sourceArtifactInventory: sourceBinding.preflight.sourceArtifactInventory,
    });
    return result.status === "refused"
      ? { ...result, remedy: renderV3DecomposeFinalizationRecovery(result.recovery) }
      : result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "finalization-adapter-unavailable";
    return refusal(input, reason, {
      kind: "manual-guidance",
      message: `Finalization could not establish repository authority: ${reason}`,
    });
  }
}
