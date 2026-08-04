/** First-parent branch inspection for retrofit delivery authoring. */

import { z } from "zod";

import {
  affectedPaths,
  resolveChangeSet,
  type ChangeSet,
  type RawGitExec,
} from "../change-facts.js";
import { ChangeSetSchema } from "../change-facts.schema.js";
import { parseCommitMessage } from "../commit-check/parser.js";
import {
  parseTaskReference,
  type ParsedTaskReference,
  type ParsedTaskReferenceItem,
} from "../commit-check/task-reference.js";
import { scanTaskListStructure } from "../task-list/scanner.js";
import {
  createDeliveryAuthoringSnapshot,
  type DeliveryAuthoringSnapshotV1,
} from "./authoring-schema.js";
import {
  renderDeliveryAuthoringMap,
  type DeliveryAuthoringSlotsV1,
} from "./authoring-map.js";
import type { DeliveryCompositionProjection } from "./compose.js";
import { bindDesignInventory } from "./design-inventory.js";
import { DeliveryPlanAuthoringInputV1Schema } from "./schema.js";
import {
  buildDeliveryTaskInventory,
  type DeliveryTaskInventory,
} from "./task-inventory.js";

/** One exact first-parent transition and its contribution classification. */
export interface DeliveryBranchStep {
  readonly commit: string;
  readonly predecessor: string;
  readonly parents: readonly string[];
  readonly classification: "contribution" | "ambient-base-absorb";
  readonly changeSet: ChangeSet;
  readonly cumulativePaths: readonly string[];
}

/** Complete pinned branch facts used by retrofit authoring. */
export interface InspectedDeliveryBranch {
  readonly status: "inspected";
  readonly base: string;
  readonly head: string;
  readonly originalDivergence: { readonly predecessor: string; readonly commit: string };
  readonly steps: readonly DeliveryBranchStep[];
  readonly contributionStepIds: readonly string[];
}

/** Typed refusal from branch graph or change-fact inspection. */
export type InspectDeliveryBranchRefusal = {
  readonly status: "refused";
  readonly reason:
    | "git-coordinate-unresolved"
    | "base-not-ancestor"
    | "divergence-boundary-missing"
    | "divergence-boundary-ambiguous"
    | "first-parent-history-malformed"
    | "ambient-purity-unproven"
    | "change-facts-unknown";
};

const DeliveryFromBranchFactsSchema = z.strictObject({
  status: z.literal("inspected"),
  base: z.string().min(1),
  head: z.string().min(1),
  originalDivergence: z.strictObject({
    predecessor: z.string().min(1),
    commit: z.string().min(1),
  }),
  steps: z.array(z.strictObject({
    commit: z.string().min(1),
    predecessor: z.string().min(1),
    parents: z.array(z.string().min(1)).min(1),
    classification: z.enum(["contribution", "ambient-base-absorb"]),
    changeSet: ChangeSetSchema,
    cumulativePaths: z.array(z.string().min(1)),
  })).min(1),
  contributionStepIds: z.array(z.string().min(1)).min(1),
  taskAttributions: z.array(z.strictObject({
    commit: z.string().min(1),
    referencedTaskIds: z.array(z.string().min(1)).min(1),
    taskIds: z.array(z.string().min(1)),
    unresolvedTaskIds: z.array(z.string().min(1)),
  })),
  advisories: z.array(z.strictObject({
    kind: z.literal("unresolved-task-reference"),
    commit: z.string().min(1),
    taskId: z.string().min(1),
  })),
});

/** Inputs for one branch-derived authoring map. */
export interface PrepareDeliveryFromBranchAuthoringInput {
  readonly mapId: string;
  readonly planId: string;
  readonly workUnitId: string;
  readonly expectedCurrentPlanDigest: string | null;
  readonly taskListPath: string;
  readonly taskListContent: string;
  readonly designInventory: unknown;
  readonly exec: RawGitExec;
  readonly base: string;
  readonly head: string;
}

/** Result of preparing transient branch-derived authoring state. */
export type PrepareDeliveryFromBranchAuthoringResult =
  | {
    readonly status: "prepared";
    readonly snapshot: DeliveryAuthoringSnapshotV1;
    readonly markdown: string;
    readonly inspection: InspectedDeliveryBranch;
  }
  | {
    readonly status: "refused";
    readonly reason:
      | "invalid-design-inventory"
      | "task-list-malformed"
      | "verification-phase-missing"
      | "verification-task-ambiguous"
      | "invalid-authoring-identity"
      | "commit-attribution-unreadable"
      | InspectDeliveryBranchRefusal["reason"];
  };

/** Inspect one selected base line and branch head. */
export async function inspectDeliveryBranch(input: {
  readonly exec: RawGitExec;
  readonly base: string;
  readonly head: string;
}): Promise<InspectedDeliveryBranch | InspectDeliveryBranchRefusal> {
  let base: string;
  let head: string;
  let baseReachable: Set<string>;
  let headReachable: Set<string>;
  let firstParent: string[];
  try {
    [base, head] = await Promise.all([
      gitLine(input.exec, ["rev-parse", "--verify", `${input.base}^{commit}`]),
      gitLine(input.exec, ["rev-parse", "--verify", `${input.head}^{commit}`]),
    ]);
    [baseReachable, headReachable, firstParent] = await Promise.all([
      gitLines(input.exec, ["rev-list", base]).then((lines) => new Set(lines)),
      gitLines(input.exec, ["rev-list", head]).then((lines) => new Set(lines)),
      gitLines(input.exec, ["rev-list", "--first-parent", head]),
    ]);
  } catch {
    return { status: "refused", reason: "git-coordinate-unresolved" };
  }
  if (!headReachable.has(base)) return { status: "refused", reason: "base-not-ancestor" };

  const candidates = firstParent.flatMap((commit, index) => {
    const predecessor = firstParent[index + 1];
    return !baseReachable.has(commit) && predecessor !== undefined && baseReachable.has(predecessor)
      ? [{ index, commit, predecessor }]
      : [];
  });
  if (candidates.length === 0) {
    return { status: "refused", reason: "divergence-boundary-missing" };
  }
  if (candidates.length > 1) {
    return { status: "refused", reason: "divergence-boundary-ambiguous" };
  }
  const boundary = candidates[0];
  if (boundary === undefined) return { status: "refused", reason: "divergence-boundary-missing" };
  const commits = firstParent.slice(0, boundary.index + 1).reverse();
  const cumulative = new Set<string>();
  const steps: DeliveryBranchStep[] = [];

  for (const commit of commits) {
    let parents: string[];
    try {
      const record = await gitLines(input.exec, ["rev-list", "--parents", "-n", "1", commit]);
      const fields = record[0]?.split(" ") ?? [];
      if (fields[0] !== commit) {
        return { status: "refused", reason: "first-parent-history-malformed" };
      }
      parents = fields.slice(1);
    } catch {
      return { status: "refused", reason: "first-parent-history-malformed" };
    }
    const predecessor = parents[0];
    if (predecessor === undefined) {
      return { status: "refused", reason: "first-parent-history-malformed" };
    }
    const changeSet = await resolveChangeSet(input.exec, predecessor, commit);
    if (changeSet.changeSet === "unknown") {
      return { status: "refused", reason: "change-facts-unknown" };
    }
    const classification = await classifyStep(input.exec, commit, parents, baseReachable);
    if (classification === null) {
      return { status: "refused", reason: "ambient-purity-unproven" };
    }
    if (classification === "contribution") {
      for (const path of affectedPaths(changeSet.changes)) cumulative.add(path);
    }
    steps.push({
      commit,
      predecessor,
      parents,
      classification,
      changeSet,
      cumulativePaths: sortCanonicalBytes(cumulative),
    });
  }
  if (steps[0]?.predecessor !== boundary.predecessor) {
    return { status: "refused", reason: "first-parent-history-malformed" };
  }
  return {
    status: "inspected",
    base,
    head,
    originalDivergence: { predecessor: boundary.predecessor, commit: boundary.commit },
    steps,
    contributionStepIds: steps
      .filter((step) => step.classification === "contribution")
      .map((step) => step.commit),
  };
}

/**
 * Prepare one branch-derived authoring map without writing repository state.
 *
 * @param input - Validated identity, design, task-list, and Git coordinates
 * @returns A complete transient pair or a typed refusal
 */
export async function prepareDeliveryFromBranchAuthoring(
  input: PrepareDeliveryFromBranchAuthoringInput,
): Promise<PrepareDeliveryFromBranchAuthoringResult> {
  const design = bindDesignInventory(input.designInventory);
  if (design.status === "refused") return design;
  const tasks = buildDeliveryTaskInventory(input.taskListContent);
  if (tasks.status === "refused") return tasks;
  const inspection = await inspectDeliveryBranch({
    exec: input.exec,
    base: input.base,
    head: input.head,
  });
  if (inspection.status === "refused") return inspection;
  const attribution = await deriveTaskAttributions(
    input.exec,
    inspection,
    input.taskListPath,
    input.taskListContent,
    tasks.inventory,
  );
  if (attribution.status === "refused") return attribution;
  const facts = {
    ...inspection,
    taskAttributions: attribution.value.taskAttributions,
    advisories: attribution.value.advisories,
  };

  try {
    const snapshot = createDeliveryAuthoringSnapshot({
      mapId: input.mapId,
      originalWorkUnitId: input.workUnitId,
      planId: input.planId,
      expectedCurrentPlanDigest: input.expectedCurrentPlanDigest,
      design: design.inventory,
      tasks: tasks.inventory,
      source: {
        entry: "from-branch",
        inputs: {
          taskListPath: input.taskListPath,
          base: inspection.base,
          head: inspection.head,
        },
        facts,
        identitySequence: inspection.steps.map((step) => step.commit),
      },
    });
    return {
      status: "prepared",
      snapshot,
      markdown: renderDeliveryAuthoringMap(snapshot),
      inspection,
    };
  } catch {
    return { status: "refused", reason: "invalid-authoring-identity" };
  }
}

/** Resolve authored branch boundaries into the entry-neutral composition projection. */
export function resolveDeliveryFromBranchProjection(input: {
  readonly snapshot: DeliveryAuthoringSnapshotV1;
  readonly slots: DeliveryAuthoringSlotsV1;
}): {
  readonly status: "refused";
  readonly reason:
    | "from-branch-facts-malformed"
    | "branch-boundary-mode-invalid"
    | "boundary-member-mismatch"
    | "authoring-projection-invalid";
} | { readonly status: "resolved"; readonly projection: DeliveryCompositionProjection } {
  if (input.snapshot.source.entry !== "from-branch") {
    return { status: "refused", reason: "from-branch-facts-malformed" };
  }
  const facts = DeliveryFromBranchFactsSchema.safeParse(input.snapshot.source.facts);
  if (!facts.success || !branchFactsMatchSnapshot(input.snapshot, facts.data)) {
    return { status: "refused", reason: "from-branch-facts-malformed" };
  }
  if (input.slots.boundary.kind !== "explicit") {
    return { status: "refused", reason: "branch-boundary-mode-invalid" };
  }
  const segments = input.slots.boundary.segments;
  if (segments.length !== input.slots.members.length
    || segments.some((segment, index) => segment.chunkKey !== input.slots.members[index]?.chunkKey)) {
    return { status: "refused", reason: "boundary-member-mismatch" };
  }

  const authoring = DeliveryPlanAuthoringInputV1Schema.safeParse({
    schemaVersion: 1,
    semanticsVersion: "delivery-plan/v1",
    workUnitId: input.snapshot.originalWorkUnitId,
    design: {
      artifacts: input.snapshot.design.artifacts.map(({ artifactId }) => ({ artifactId })),
      elements: input.snapshot.design.elements.map(({ elementId }) => ({ elementId })),
    },
    tasks: {
      implementation: input.snapshot.tasks.implementation.map(({ taskId }) => ({ taskId })),
      verificationTaskId: input.snapshot.tasks.verificationTaskId,
    },
    entry: "from-branch",
    projection: input.slots.projection,
    members: input.slots.members.map((member, index) => ({
      ...member,
      taskIds: taskIdsForSegment(
        segments[index]?.sourceIds ?? [],
        facts.data.taskAttributions,
        input.snapshot,
      ),
    })),
    seams: input.slots.seams,
  });
  if (!authoring.success) {
    return { status: "refused", reason: "authoring-projection-invalid" };
  }
  return {
    status: "resolved",
    projection: {
      authoring: authoring.data,
      contributionStepIds: facts.data.contributionStepIds,
      memberContributionSteps: segments.map((segment) => ({
        chunkKey: segment.chunkKey,
        contributionStepIds: segment.sourceIds,
      })),
      sourceAdvisories: facts.data.advisories,
    },
  };
}

function branchFactsMatchSnapshot(
  snapshot: DeliveryAuthoringSnapshotV1,
  facts: z.infer<typeof DeliveryFromBranchFactsSchema>,
): boolean {
  const first = facts.steps[0];
  if (first === undefined) return false;
  const stepIds = facts.steps.map((step) => step.commit);
  const contributionIds = facts.steps
    .filter((step) => step.classification === "contribution")
    .map((step) => step.commit);
  const attributionCommits = facts.taskAttributions.map((attribution) => attribution.commit);
  const attributionPositions = attributionCommits.map((commit) => contributionIds.indexOf(commit));
  const expectedAdvisories = facts.taskAttributions.flatMap((attribution) => (
    attribution.unresolvedTaskIds.map((taskId) => ({
      kind: "unresolved-task-reference" as const,
      commit: attribution.commit,
      taskId,
    }))
  ));
  return JSON.stringify(stepIds) === JSON.stringify(snapshot.source.identitySequence)
    && JSON.stringify(contributionIds) === JSON.stringify(facts.contributionStepIds)
    && attributionPositions.every((position, index) => position !== -1
      && (index === 0 || position > (attributionPositions[index - 1] ?? position)))
    && new Set(attributionCommits).size === attributionCommits.length
    && JSON.stringify(expectedAdvisories) === JSON.stringify(facts.advisories)
    && first.predecessor === facts.originalDivergence.predecessor
    && first.commit === facts.originalDivergence.commit;
}

const TASK_CONTEXT_PATTERN = /^(?<filename>tasks-[A-Za-z0-9-]+\.md) \((?<reference>.+)\)$/u;

async function deriveTaskAttributions(
  exec: RawGitExec,
  inspection: InspectedDeliveryBranch,
  taskListPath: string,
  taskListContent: string,
  inventory: DeliveryTaskInventory,
): Promise<{
  readonly status: "ok";
  readonly value: {
    readonly taskAttributions: readonly {
      readonly commit: string;
      readonly referencedTaskIds: readonly string[];
      readonly taskIds: readonly string[];
      readonly unresolvedTaskIds: readonly string[];
    }[];
    readonly advisories: readonly {
      readonly kind: "unresolved-task-reference";
      readonly commit: string;
      readonly taskId: string;
    }[];
  };
} | {
  readonly status: "refused";
  readonly reason: "commit-attribution-unreadable";
}> {
  const orderedTaskIds = taskListIds(taskListContent);
  const parentTaskIds = [
    ...inventory.implementation.map((task) => task.taskId),
    inventory.verificationTaskId,
  ];
  const taskAttributions: {
    readonly commit: string;
    readonly referencedTaskIds: readonly string[];
    readonly taskIds: readonly string[];
    readonly unresolvedTaskIds: readonly string[];
  }[] = [];
  const advisories: {
    readonly kind: "unresolved-task-reference";
    readonly commit: string;
    readonly taskId: string;
  }[] = [];
  for (const commit of inspection.contributionStepIds) {
    let message: string;
    try {
      message = await gitText(exec, ["show", "-s", "--format=%B", commit]);
    } catch {
      return { status: "refused", reason: "commit-attribution-unreadable" };
    }
    const trailer = parseCommitMessage(message).contextTrailer;
    if (trailer?.key !== "Context") continue;
    const taskContext = TASK_CONTEXT_PATTERN.exec(trailer.value);
    if (taskContext?.groups?.filename !== artifactBasename(taskListPath)) continue;
    const referenceValue = taskContext.groups.reference;
    const reference = referenceValue === undefined ? null : parseTaskReference(referenceValue);
    if (reference === null) continue;
    const referencedTaskIds = expandTaskReference(reference, orderedTaskIds);
    const resolution = resolveToParentInventory(referencedTaskIds, parentTaskIds);
    taskAttributions.push({ commit, referencedTaskIds, ...resolution });
    advisories.push(...resolution.unresolvedTaskIds.map((taskId) => ({
      kind: "unresolved-task-reference" as const,
      commit,
      taskId,
    })));
  }
  return { status: "ok", value: { taskAttributions, advisories } };
}

function artifactBasename(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

function taskListIds(content: string): string[] {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") return [];
  return scan.events.flatMap((event) => (
    event.type === "parent" || event.type === "subtask" ? [event.item.id] : []
  ));
}

function expandTaskReference(
  reference: ParsedTaskReference,
  orderedTaskIds: readonly string[],
): string[] {
  const expanded = reference.items.flatMap((item) => expandTaskReferenceItem(item, orderedTaskIds));
  return [...new Set(expanded)];
}

function expandTaskReferenceItem(
  item: ParsedTaskReferenceItem,
  orderedTaskIds: readonly string[],
): string[] {
  if (item.kind === "single") return [item.taskId];
  const start = orderedTaskIds.indexOf(item.startTaskId);
  const end = orderedTaskIds.indexOf(item.endTaskId);
  return start !== -1 && end >= start
    ? orderedTaskIds.slice(start, end + 1)
    : [item.startTaskId, item.endTaskId];
}

function resolveToParentInventory(
  taskIds: readonly string[],
  parentTaskIds: readonly string[],
): { readonly taskIds: readonly string[]; readonly unresolvedTaskIds: readonly string[] } {
  const parents = new Set(parentTaskIds);
  const resolved: string[] = [];
  const unresolved: string[] = [];
  for (const taskId of taskIds) {
    let candidate = taskId;
    while (!parents.has(candidate) && candidate.includes(".")) {
      candidate = candidate.slice(0, candidate.lastIndexOf("."));
    }
    if (parents.has(candidate)) resolved.push(candidate);
    else unresolved.push(taskId);
  }
  return {
    taskIds: [...new Set(resolved)],
    unresolvedTaskIds: [...new Set(unresolved)],
  };
}

function taskIdsForSegment(
  commitIds: readonly string[],
  attributions: z.infer<typeof DeliveryFromBranchFactsSchema>["taskAttributions"],
  snapshot: DeliveryAuthoringSnapshotV1,
): string[] {
  const represented = new Set(attributions
    .filter((attribution) => commitIds.includes(attribution.commit))
    .flatMap((attribution) => attribution.taskIds));
  return [
    ...snapshot.tasks.implementation.map((task) => task.taskId),
    snapshot.tasks.verificationTaskId,
  ].filter((taskId) => represented.has(taskId));
}

async function classifyStep(
  exec: RawGitExec,
  commit: string,
  parents: readonly string[],
  baseReachable: ReadonlySet<string>,
): Promise<DeliveryBranchStep["classification"] | null> {
  if (parents.length === 1) return "contribution";
  if (parents.length !== 2) return null;
  const secondParent = parents[1];
  if (secondParent === undefined || !baseReachable.has(secondParent)) return "contribution";
  try {
    const [expectedTreeOutput, actualTree] = await Promise.all([
      gitLines(exec, ["merge-tree", "--write-tree", parents[0] ?? "", secondParent]),
      gitLine(exec, ["rev-parse", `${commit}^{tree}`]),
    ]);
    const expectedTree = expectedTreeOutput.find((line) => /^[0-9a-f]{40,64}$/u.test(line));
    return expectedTree === actualTree ? "ambient-base-absorb" : null;
  } catch {
    return null;
  }
}

async function gitLine(exec: RawGitExec, args: string[]): Promise<string> {
  const lines = await gitLines(exec, args);
  if (lines.length !== 1 || lines[0] === undefined) throw new Error("unexpected Git output");
  return lines[0];
}

async function gitLines(exec: RawGitExec, args: string[]): Promise<string[]> {
  const { stdout } = await exec(args);
  return new TextDecoder("utf-8", { fatal: true }).decode(stdout).trim().split(/\r?\n/u).filter(Boolean);
}

async function gitText(exec: RawGitExec, args: string[]): Promise<string> {
  const { stdout } = await exec(args);
  return new TextDecoder("utf-8", { fatal: true }).decode(stdout);
}

function sortCanonicalBytes(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}
