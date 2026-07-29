/** Pure construction of one exact, mutation-free `start` graduation transaction. */

import { posix } from "node:path";

import {
  parseMetaRecord,
  reconcileMetaFields,
  setMetaBranch,
  setMetaBulletFields,
  setMetaClass,
  setMetaCurrentWorkflow,
  validateMetaFieldBlockShape,
  type MetaFieldName,
} from "../active/meta-reader.js";
import { digestBytes } from "../canonical/canonical-json.js";
import { WorkClassSchema, type WorkClass } from "../kernel/index.js";
import type { V3PlanCanonicalPathState, V3PlanObservedPathState } from "./decompose-v3-plan.js";
import type { V3DecomposeMachine } from "./decompose-v3-schema.js";
import {
  validateDecompositionPlanningTuple,
} from "./decomposition-planning-tuple.js";
import {
  removeDecompositionReceiptMarker,
} from "./decomposition-receipt-marker.js";
import type { DecompositionIntegrationAnchor } from "./decomposition-integration-anchor.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import { BEGIN_CURRENT_WORKFLOW_SENTINEL } from "../active/current-workflow-consistency.js";

/** One exact stored artifact captured before graduation. */
export interface GraduationStoredArtifact {
  basename: string;
  sourcePath: string;
  targetPath: string;
  objectKind: "blob";
  mode: "100644" | "100755";
  oid: string;
  contentDigest: `sha256:${string}`;
  bytes: Uint8Array;
}

/** One exact artifact image to install at its active destination. */
export interface GraduationTargetArtifact {
  basename: string;
  targetPath: string;
  mode: "100644" | "100755";
  contentDigest: `sha256:${string}`;
  bytes: Uint8Array;
}

/** How graduation obtains the resolved work-unit Class. */
export type GraduationClassResolution =
  | { kind: "preserved"; value: WorkClass }
  | { kind: "supplied"; value: WorkClass };

/** Exact branch, worktree, and index facts that occupation must retain. */
export interface GraduationOccupationPreimage {
  mode: "spawned" | "in-place";
  baseHead: string;
  branch: { kind: "absent"; ref: string };
  worktree:
    | { kind: "absent"; path: string }
    | { kind: "current"; path: string; head: string; branch: string | null };
  indexTree: string;
  operation:
    | {
      kind: "spawned";
      branch: string;
      base: string;
      worktreePath: string;
      locationTemplate: string;
      repo: string;
      wuName: string;
      spawningIdentity: string;
      postCreateScript?: string;
      primaryWorktreePath?: string;
      registeredHarnessDirs?: string;
    }
    | {
      kind: "in-place";
      branch: string;
      worktreePath: string;
    };
}

/** Complete normalized inputs for pure graduation transaction construction. */
export interface PrepareGraduationTransactionInput {
  slug: string;
  location: "planned" | "provisional";
  sourceDirectory: string;
  targetDirectory: string;
  artifacts: GraduationStoredArtifact[];
  destinations: Array<{ path: string; state: V3PlanObservedPathState }>;
  anchor: DecompositionIntegrationAnchor | null;
  classResolution: GraduationClassResolution;
  occupation: GraduationOccupationPreimage;
}

/** Immutable authority consumed by the start-only atomic graduation port. */
export interface ValidatedGraduationTransaction {
  kind: "validated-graduation-transaction";
  schemaVersion: 1;
  slug: string;
  branch: string;
  source: {
    location: "planned" | "provisional";
    directory: string;
    metaPath: string;
    artifacts: GraduationStoredArtifact[];
  };
  target: {
    directory: string;
    metaPath: string;
    metaBytes: Uint8Array;
    artifacts: GraduationTargetArtifact[];
    pathStates: Array<{
      path: string;
      before: V3PlanCanonicalPathState;
      after: V3PlanCanonicalPathState;
    }>;
  };
  policy: {
    provenance: "ordinary" | "decomposition";
    profile: V3DecomposeMachine["planningProfile"];
    taskAuthority: "none" | "provisional-seed" | "task-list";
    workflow: { kind: "preserved" | "derived"; value: "draft-design" | "create-spec" | "generate-tasks" };
    class: GraduationClassResolution;
    decompositionReceiptRemoved: boolean;
  };
  reconciliation: {
    backfilled: MetaFieldName[];
    notice: string | null;
  };
  occupation: GraduationOccupationPreimage;
}

/** Closed construction result with a stable refusal locus. */
export type PrepareGraduationTransactionResult =
  | { status: "ready"; transaction: ValidatedGraduationTransaction }
  | {
    status: "refused";
    reason:
      | "source-shape"
      | "destination-preimage"
      | "meta-shape"
      | "planning-tuple"
      | "class-mismatch"
      | "occupation-preimage";
    locus: string;
    detail?: string;
  };

const decoder = new TextDecoder("utf-8", { fatal: true });

function comparePaths(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function fileState(artifact: Pick<GraduationStoredArtifact, "mode" | "bytes">): V3PlanCanonicalPathState {
  return {
    kind: "file",
    mode: artifact.mode,
    contentDigest: digestBytes(artifact.bytes),
  };
}

function validOccupation(input: PrepareGraduationTransactionInput): boolean {
  const { occupation } = input;
  if (occupation.baseHead === "" || occupation.indexTree === "") return false;
  if (occupation.branch.ref !== `refs/heads/plan/${input.slug}`) return false;
  if (occupation.operation.branch !== `plan/${input.slug}`) return false;
  return occupation.mode === "spawned"
    ? occupation.worktree.kind === "absent"
      && occupation.operation.kind === "spawned"
      && occupation.operation.base === occupation.baseHead
      && occupation.operation.worktreePath === occupation.worktree.path
      && occupation.operation.wuName === input.slug
      && occupation.operation.locationTemplate !== ""
      && occupation.operation.repo !== ""
      && occupation.operation.spawningIdentity !== ""
    : occupation.worktree.kind === "current"
      && occupation.operation.kind === "in-place"
      && occupation.operation.worktreePath === occupation.worktree.path;
}

/**
 * Produce the complete target-byte and preimage contract consumed by atomic graduation.
 *
 * @param input - One normalized, exact read-only source/destination/occupation snapshot
 * @returns A closed transaction or the first deterministic refusal
 */
export function prepareValidatedGraduationTransaction(
  input: PrepareGraduationTransactionInput,
): PrepareGraduationTransactionResult {
  const matcher = artifactMatcher(input.slug);
  const sortedArtifacts = input.artifacts.slice().sort((left, right) =>
    comparePaths(left.sourcePath, right.sourcePath));
  const basenames = new Set<string>();
  for (const artifact of sortedArtifacts) {
    if (!matcher.test(artifact.basename)
      || artifact.sourcePath !== posix.join(input.sourceDirectory, artifact.basename)
      || artifact.targetPath !== posix.join(input.targetDirectory, artifact.basename)
      || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(artifact.oid)
      || artifact.contentDigest !== digestBytes(artifact.bytes)
      || basenames.has(artifact.basename)) {
      return { status: "refused", reason: "source-shape", locus: artifact.sourcePath };
    }
    basenames.add(artifact.basename);
  }
  const metaBasename = `meta-${input.slug}.md`;
  const metaArtifact = sortedArtifacts.find(({ basename }) => basename === metaBasename);
  if (metaArtifact === undefined) {
    return {
      status: "refused",
      reason: "source-shape",
      locus: posix.join(input.sourceDirectory, metaBasename),
    };
  }

  const expectedTargets = sortedArtifacts.map(({ targetPath }) => targetPath);
  const destinations = input.destinations.slice().sort((left, right) => comparePaths(left.path, right.path));
  if (destinations.length !== expectedTargets.length) {
    return { status: "refused", reason: "destination-preimage", locus: input.targetDirectory };
  }
  for (let index = 0; index < expectedTargets.length; index += 1) {
    const expected = expectedTargets[index];
    const observed = destinations[index];
    if (expected === undefined || observed === undefined
      || observed.path !== expected || observed.state.kind !== "absent") {
      return {
        status: "refused",
        reason: "destination-preimage",
        locus: observed?.path ?? expected ?? input.targetDirectory,
      };
    }
  }

  let metaContent: string;
  try {
    metaContent = decoder.decode(metaArtifact.bytes);
  } catch {
    return { status: "refused", reason: "source-shape", locus: metaArtifact.sourcePath };
  }
  const metaDiagnostics = validateMetaFieldBlockShape(metaContent, metaArtifact.sourcePath);
  if (metaDiagnostics.length > 0) {
    return {
      status: "refused",
      reason: "meta-shape",
      locus: metaArtifact.sourcePath,
      detail: metaDiagnostics[0],
    };
  }
  const parsedMeta = parseMetaRecord(metaContent);

  const planning = validateDecompositionPlanningTuple({
    expectedSlug: input.slug,
    metaPath: metaArtifact.sourcePath,
    metaContent,
    meta: parsedMeta,
    artifacts: sortedArtifacts.map((artifact) => ({
      path: artifact.sourcePath,
      state: fileState(artifact),
    })),
    anchor: input.anchor,
  });
  if (planning.status === "refused") {
    return {
      status: "refused",
      reason: "planning-tuple",
      locus: planning.locus,
      detail: planning.reason,
    };
  }

  if (!WorkClassSchema.safeParse(input.classResolution.value).success) {
    return { status: "refused", reason: "class-mismatch", locus: `${metaBasename}#Class` };
  }
  if (input.classResolution.kind === "preserved"
    && parsedMeta.workClass !== input.classResolution.value) {
    return { status: "refused", reason: "class-mismatch", locus: `${metaBasename}#Class` };
  }
  if (input.classResolution.kind === "supplied" && parsedMeta.workClass !== "TBD") {
    return { status: "refused", reason: "class-mismatch", locus: `${metaBasename}#Class` };
  }
  if (!validOccupation(input)) {
    return { status: "refused", reason: "occupation-preimage", locus: `plan/${input.slug}` };
  }

  const workflow = planning.recordedWorkflow === null
    ? { kind: "derived" as const, value: planning.expectedWorkflow }
    : { kind: "preserved" as const, value: planning.recordedWorkflow };
  const reconciled = reconcileMetaFields(metaContent, {
    "Current Workflow": workflow.value,
  });
  let targetMeta = setMetaBranch(reconciled.content, `plan/${input.slug}`);
  if (input.classResolution.kind === "supplied") {
    targetMeta = setMetaClass(targetMeta, input.classResolution.value);
  }
  targetMeta = setMetaCurrentWorkflow(targetMeta, workflow.value);
  targetMeta = setMetaBulletFields(targetMeta, {
    "Next Action": BEGIN_CURRENT_WORKFLOW_SENTINEL,
  });
  if (planning.provenance === "decomposition") {
    const receiptId = input.anchor?.receiptId;
    if (receiptId === undefined) {
      return { status: "refused", reason: "planning-tuple", locus: `${metaBasename}#Decomposition Receipt` };
    }
    targetMeta = removeDecompositionReceiptMarker(targetMeta, receiptId);
  }

  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(targetMeta);
  const targetArtifacts = sortedArtifacts.map((artifact): GraduationTargetArtifact => {
    const bytes = artifact.basename === metaBasename
      ? metaBytes
      : new Uint8Array(artifact.bytes);
    return {
      basename: artifact.basename,
      targetPath: artifact.targetPath,
      mode: artifact.mode,
      contentDigest: digestBytes(bytes),
      bytes,
    };
  });
  const sourceByTarget = new Map(sortedArtifacts.map((artifact) => [artifact.targetPath, artifact]));
  const targetByPath = new Map(targetArtifacts.map((artifact) => [artifact.targetPath, artifact]));
  const pathStates = expectedTargets.map((path) => {
    const source = sourceByTarget.get(path);
    const target = targetByPath.get(path);
    if (source === undefined || target === undefined) {
      throw new Error("validated graduation artifact map lost a target path");
    }
    return {
      path,
      before: { kind: "absent" } as const,
      after: fileState(target),
    };
  });
  const backfilled = [...reconciled.backfilled];
  const notice = backfilled.length === 0
    ? null
    : `Backfilled ${backfilled.length} meta field(s) against the code field model: ${backfilled.join(", ")}.`;

  return {
    status: "ready",
    transaction: {
      kind: "validated-graduation-transaction",
      schemaVersion: 1,
      slug: input.slug,
      branch: `plan/${input.slug}`,
      source: {
        location: input.location,
        directory: input.sourceDirectory,
        metaPath: metaArtifact.sourcePath,
        artifacts: sortedArtifacts.map((artifact) => ({
          ...artifact,
          bytes: new Uint8Array(artifact.bytes),
        })),
      },
      target: {
        directory: input.targetDirectory,
        metaPath: posix.join(input.targetDirectory, metaBasename),
        metaBytes,
        artifacts: targetArtifacts,
        pathStates,
      },
      policy: {
        provenance: planning.provenance,
        profile: planning.profile,
        taskAuthority: planning.taskAuthority,
        workflow,
        class: input.classResolution,
        decompositionReceiptRemoved: planning.provenance === "decomposition",
      },
      reconciliation: { backfilled, notice },
      occupation: structuredClone(input.occupation),
    },
  };
}
