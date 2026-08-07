/** Pure validation for ordinary planning artifact tuples. */

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

export interface PlanningArtifact {
  path: string;
  state: V3PlanObservedPathState;
}

export interface PlanningArtifactTupleInput {
  expectedSlug: string;
  metaPath: string;
  metaContent: string;
  meta: ParsedMetaRecord;
  artifacts: PlanningArtifact[];
}

export type PlanningArtifactTupleRefusal =
  | "state-mismatch"
  | "design-mismatch"
  | "artifact-mismatch"
  | "task-authority"
  | "workflow-mismatch";

export type PlanningArtifactTupleResult =
  | {
    status: "valid";
    profile: V3DecomposeMachine["planningProfile"];
    recordedWorkflow: PlanningWorkflow | null;
    expectedWorkflow: Exclude<PlanningWorkflow, "create-spec">;
    taskAuthority: "none" | "provisional-seed" | "task-list";
  }
  | {
    status: "refused";
    reason: PlanningArtifactTupleRefusal;
    locus: string;
    detail?: string;
  };

type PlanningProfile = V3DecomposeMachine["planningProfile"];

function metaLocus(input: PlanningArtifactTupleInput, field: string): string {
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
  input: PlanningArtifactTupleInput,
  profile: PlanningProfile,
): {
  refusal?: Extract<PlanningArtifactTupleResult, { status: "refused" }>;
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
  const byBasename = new Map<string, PlanningArtifact>();
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

/**
 * Validate one complete planning meta/artifact family without performing I/O.
 *
 * Ordinary planning includes `create-spec` for draft-backed work units.
 */
export function validatePlanningArtifactTuple(
  input: PlanningArtifactTupleInput,
): PlanningArtifactTupleResult {
  if (input.meta.state !== "Planning") {
    return { status: "refused", reason: "state-mismatch", locus: metaLocus(input, "State") };
  }

  const profile = inferOrdinaryProfile(input.expectedSlug, input.meta.design);
  if (profile === null) {
    return { status: "refused", reason: "design-mismatch", locus: metaLocus(input, "Design") };
  }

  const artifactValidation = validateArtifactFamily(input, profile);
  if (artifactValidation.refusal !== undefined) return artifactValidation.refusal;
  const expectedTask = `tasks-${input.expectedSlug}.md`;
  let taskAuthority: "none" | "provisional-seed" | "task-list";
  if (input.meta.taskList === null) {
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
    const allowed = profile.kind === "draft"
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
    profile,
    recordedWorkflow,
    expectedWorkflow,
    taskAuthority,
  };
}
