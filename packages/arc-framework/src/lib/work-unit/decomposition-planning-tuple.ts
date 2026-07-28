/** Pure validation for ordinary and receipt-bound planning artifact tuples. */

import { posix } from "node:path";

import type { ParsedMetaRecord } from "../active/meta-schema.js";
import {
  checkCurrentWorkflowConsistency,
  isPlanningWorkflow,
  type PlanningWorkflow,
} from "../active/current-workflow-consistency.js";
import { canonicalize } from "../canonical/canonical-json.js";
import type { V3PlanObservedPathState } from "./decompose-v3-plan.js";
import type { V3DecomposeMachine } from "./decompose-v3-schema.js";
import {
  readDecompositionReceiptMarker,
} from "./decomposition-receipt-marker.js";
import type { DecompositionIntegrationAnchor } from "./decomposition-integration-anchor.js";

export interface DecompositionPlanningArtifact {
  path: string;
  state: V3PlanObservedPathState;
}

export interface DecompositionPlanningTupleInput {
  expectedSlug: string;
  metaPath: string;
  metaContent: string;
  meta: ParsedMetaRecord;
  artifacts: DecompositionPlanningArtifact[];
  anchor: DecompositionIntegrationAnchor | null;
}

export type DecompositionPlanningTupleRefusal =
  | "marker-duplicate"
  | "marker-misplaced"
  | "marker-malformed"
  | "anchor-missing"
  | "receipt-mismatch"
  | "publication-mismatch"
  | "state-mismatch"
  | "design-mismatch"
  | "artifact-mismatch"
  | "task-authority"
  | "workflow-mismatch";

export type DecompositionPlanningTupleResult =
  | {
    status: "valid";
    provenance: "ordinary" | "decomposition";
    profile: V3DecomposeMachine["planningProfile"];
    recordedWorkflow: PlanningWorkflow | null;
    expectedWorkflow: Exclude<PlanningWorkflow, "create-spec">;
    taskAuthority: "none" | "provisional-seed" | "task-list";
  }
  | {
    status: "refused";
    reason: DecompositionPlanningTupleRefusal;
    locus: string;
    detail?: string;
  };

type PlanningProfile = V3DecomposeMachine["planningProfile"];

function metaLocus(input: DecompositionPlanningTupleInput, field: string): string {
  return `${posix.basename(input.metaPath)}#${field}`;
}

function expectedProfile(
  slug: string,
  kind: PlanningProfile["kind"],
): PlanningProfile {
  if (kind === "draft") return { kind, sourceDesign: [`draft-${slug}.md`] };
  if (kind === "single-spec") return { kind, sourceDesign: [`spec-${slug}.md`] };
  return {
    kind,
    sourceDesign: [`spec-${slug}-prd.md`, `spec-${slug}-rfc.md`],
  };
}

function expectedDesign(slug: string, kind: PlanningProfile["kind"]): string[] {
  return [...expectedProfile(slug, kind).sourceDesign];
}

function inferOrdinaryProfile(
  slug: string,
  design: readonly string[],
): PlanningProfile | null {
  for (const kind of ["draft", "single-spec", "paired-spec"] as const) {
    const profile = expectedProfile(slug, kind);
    if (canonicalize(design) === canonicalize(profile.sourceDesign)) return profile;
  }
  return null;
}

function canonicalFile(state: V3PlanObservedPathState): boolean {
  return state.kind === "file";
}

function validateArtifactFamily(
  input: DecompositionPlanningTupleInput,
  profile: PlanningProfile,
): {
  refusal?: Extract<DecompositionPlanningTupleResult, { status: "refused" }>;
  seedPresent: boolean;
} {
  const directory = posix.dirname(input.metaPath);
  const expectedMeta = `meta-${input.expectedSlug}.md`;
  if (posix.basename(input.metaPath) !== expectedMeta) {
    return {
      refusal: {
        status: "refused",
        reason: "artifact-mismatch",
        locus: posix.basename(input.metaPath),
      },
      seedPresent: false,
    };
  }
  const seen = new Set<string>();
  const byBasename = new Map<string, DecompositionPlanningArtifact>();
  for (const artifact of input.artifacts) {
    const basename = posix.basename(artifact.path);
    if (posix.dirname(artifact.path) !== directory
      || seen.has(basename)
      || !canonicalFile(artifact.state)) {
      return {
        refusal: { status: "refused", reason: "artifact-mismatch", locus: basename },
        seedPresent: false,
      };
    }
    seen.add(basename);
    byBasename.set(basename, artifact);
  }

  const taskArtifacts = [...byBasename.keys()].filter((basename) =>
    basename.startsWith("tasks-") && basename.endsWith(".md"));
  const expectedTask = `tasks-${input.expectedSlug}.md`;
  if (taskArtifacts.length > 1 || (taskArtifacts[0] !== undefined && taskArtifacts[0] !== expectedTask)) {
    return {
      refusal: {
        status: "refused",
        reason: "task-authority",
        locus: taskArtifacts[0] ?? expectedTask,
      },
      seedPresent: false,
    };
  }

  const expected = new Set([
    expectedMeta,
    ...expectedDesign(input.expectedSlug, profile.kind),
    ...taskArtifacts,
  ]);
  for (const basename of expected) {
    if (!byBasename.has(basename)) {
      return {
        refusal: { status: "refused", reason: "artifact-mismatch", locus: basename },
        seedPresent: false,
      };
    }
  }
  for (const basename of byBasename.keys()) {
    if (!expected.has(basename)) {
      return {
        refusal: { status: "refused", reason: "artifact-mismatch", locus: basename },
        seedPresent: false,
      };
    }
  }
  return { seedPresent: taskArtifacts.length === 1 };
}

function receiptArtifactsMatch(
  input: DecompositionPlanningTupleInput,
  anchor: DecompositionIntegrationAnchor,
): string | null {
  const directory = posix.dirname(input.metaPath);
  const expected = anchor.receipt.finalized.managedPathResults
    .filter(({ path }) => posix.dirname(path) === directory)
    .map(({ path, after }) => ({ path, state: after }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const actual = input.artifacts
    .slice()
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    const left = expected[index];
    const right = actual[index];
    if (left === undefined || right === undefined || left.path !== right.path
      || canonicalize(left.state) !== canonicalize(right.state)) {
      return posix.basename(left?.path ?? right?.path ?? input.metaPath);
    }
  }
  return null;
}

/**
 * Validate one complete planning meta/artifact family without performing I/O.
 *
 * A canonical marker selects only receipt-bound policy. Its absence retains
 * ordinary planning, including `create-spec`.
 */
export function validateDecompositionPlanningTuple(
  input: DecompositionPlanningTupleInput,
): DecompositionPlanningTupleResult {
  const marker = readDecompositionReceiptMarker(input.metaContent);
  if (marker.status === "refused") {
    return {
      status: "refused",
      reason: `marker-${marker.reason}` as DecompositionPlanningTupleRefusal,
      locus: metaLocus(input, "Decomposition Receipt"),
    };
  }
  if (input.meta.state !== "Planning") {
    return { status: "refused", reason: "state-mismatch", locus: metaLocus(input, "State") };
  }

  const provenance = marker.receiptId === null ? "ordinary" : "decomposition";
  let profile: PlanningProfile;
  if (provenance === "ordinary") {
    const inferred = inferOrdinaryProfile(input.expectedSlug, input.meta.design);
    if (inferred === null) {
      return { status: "refused", reason: "design-mismatch", locus: metaLocus(input, "Design") };
    }
    profile = inferred;
  } else {
    if (input.anchor === null) {
      return {
        status: "refused",
        reason: "anchor-missing",
        locus: metaLocus(input, "Decomposition Receipt"),
      };
    }
    if (input.anchor.receiptId !== marker.receiptId
      || input.meta.decompositionReceipt !== marker.receiptId) {
      return {
        status: "refused",
        reason: "receipt-mismatch",
        locus: metaLocus(input, "Decomposition Receipt"),
      };
    }
    const matchingEntries = input.anchor.receipt.finalized.publication.entries.filter((entry) =>
      entry.kind === "new-leaf" && entry.slug === input.expectedSlug);
    if (matchingEntries.length !== 1) {
      return {
        status: "refused",
        reason: "publication-mismatch",
        locus: "receipt.finalized.publication.entries",
      };
    }
    profile = input.anchor.receipt.prepared.completedMap.machine.planningProfile;
    if (canonicalize(input.meta.design)
      !== canonicalize(expectedDesign(input.expectedSlug, profile.kind))) {
      return { status: "refused", reason: "design-mismatch", locus: metaLocus(input, "Design") };
    }
  }

  const artifactValidation = validateArtifactFamily(input, profile);
  if (artifactValidation.refusal !== undefined) return artifactValidation.refusal;
  if (provenance === "decomposition" && input.anchor !== null) {
    const mismatch = receiptArtifactsMatch(input, input.anchor);
    if (mismatch !== null) {
      return { status: "refused", reason: "artifact-mismatch", locus: mismatch };
    }
  }

  const expectedTask = `tasks-${input.expectedSlug}.md`;
  let taskAuthority: "none" | "provisional-seed" | "task-list";
  if (provenance === "decomposition") {
    if (input.meta.taskList !== null) {
      return { status: "refused", reason: "task-authority", locus: metaLocus(input, "Task List") };
    }
    taskAuthority = artifactValidation.seedPresent ? "provisional-seed" : "none";
  } else if (input.meta.taskList === null) {
    taskAuthority = artifactValidation.seedPresent ? "provisional-seed" : "none";
  } else if (input.meta.taskList === expectedTask && artifactValidation.seedPresent) {
    taskAuthority = "task-list";
  } else {
    return { status: "refused", reason: "task-authority", locus: metaLocus(input, "Task List") };
  }

  const expectedWorkflow = profile.kind === "draft" ? "draft-design" : "generate-tasks";
  const rawWorkflow = input.meta.currentWorkflow;
  if (rawWorkflow !== null && !isPlanningWorkflow(rawWorkflow)) {
    return {
      status: "refused",
      reason: "workflow-mismatch",
      locus: metaLocus(input, "Current Workflow"),
    };
  }
  const recordedWorkflow = rawWorkflow;
  if (recordedWorkflow !== null) {
    const diagnostics = checkCurrentWorkflowConsistency({
      state: input.meta.state,
      currentWorkflow: recordedWorkflow,
      design: input.meta.design,
    });
    const allowed = provenance === "ordinary" && profile.kind === "draft"
      ? recordedWorkflow === "draft-design" || recordedWorkflow === "create-spec"
      : recordedWorkflow === expectedWorkflow;
    if (diagnostics.length > 0 || !allowed) {
      return {
        status: "refused",
        reason: "workflow-mismatch",
        locus: metaLocus(input, "Current Workflow"),
        detail: diagnostics[0],
      };
    }
  }

  return {
    status: "valid",
    provenance,
    profile,
    recordedWorkflow,
    expectedWorkflow,
    taskAuthority,
  };
}
