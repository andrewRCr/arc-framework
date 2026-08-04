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
import type {
  DeliveryCompositionProjection,
  DeliveryMalformedTaskReferenceAdvisory,
  DeliveryUnresolvedTaskReferenceAdvisory,
} from "./compose.js";
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
    | "merge-tree-write-tree-unsupported"
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
  malformedTaskReferences: z.array(z.strictObject({
    commit: z.string().min(1),
    reference: z.string().min(1),
  })),
  advisories: z.array(z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("unresolved-task-reference"),
      commit: z.string().min(1),
      taskId: z.string().min(1),
    }),
    z.strictObject({
      kind: z.literal("malformed-task-reference"),
      commit: z.string().min(1),
      reference: z.string().min(1),
    }),
  ])),
  coChangePairs: z.array(z.strictObject({
    paths: z.tuple([z.string().min(1), z.string().min(1)]),
    contributionStepIds: z.array(z.string().min(1)).min(1),
  })),
  lifecycleArtifactTouches: z.array(z.strictObject({
    commit: z.string().min(1),
    paths: z.array(z.string().min(1)).min(1),
  })),
});

const DeliveryFromBranchSourceInputsSchema = z.strictObject({
  taskListPath: z.string().min(1),
  base: z.string().min(1),
  head: z.string().min(1),
});

type DeliveryFromBranchSource = {
  readonly facts: z.infer<typeof DeliveryFromBranchFactsSchema>;
  readonly sourceInputs: z.infer<typeof DeliveryFromBranchSourceInputsSchema>;
};

function resolveDeliveryFromBranchSource(
  snapshot: DeliveryAuthoringSnapshotV1,
): { readonly status: "resolved"; readonly value: DeliveryFromBranchSource } | {
  readonly status: "refused";
  readonly reason: "from-branch-facts-malformed";
} {
  if (snapshot.source.entry !== "from-branch") {
    return { status: "refused", reason: "from-branch-facts-malformed" };
  }
  const facts = DeliveryFromBranchFactsSchema.safeParse(snapshot.source.facts);
  const sourceInputs = DeliveryFromBranchSourceInputsSchema.safeParse(snapshot.source.inputs);
  if (!facts.success || !sourceInputs.success
    || !branchFactsMatchSnapshot(snapshot, facts.data, sourceInputs.data)) {
    return { status: "refused", reason: "from-branch-facts-malformed" };
  }
  return { status: "resolved", value: { facts: facts.data, sourceInputs: sourceInputs.data } };
}

/**
 * Recover the validated source advisories retained in a branch-derived authoring snapshot.
 *
 * @param snapshot - Machine-owned snapshot left after composition cleanup starts.
 * @returns Validated source advisories or the ordinary malformed-facts refusal.
 */
export function resolveDeliveryFromBranchSourceAdvisories(
  snapshot: DeliveryAuthoringSnapshotV1,
): {
  readonly status: "resolved";
  readonly advisories: readonly (
    DeliveryUnresolvedTaskReferenceAdvisory | DeliveryMalformedTaskReferenceAdvisory
  )[];
} | {
  readonly status: "refused";
  readonly reason: "from-branch-facts-malformed";
} {
  const source = resolveDeliveryFromBranchSource(snapshot);
  return source.status === "refused"
    ? source
    : { status: "resolved", advisories: source.value.facts.advisories };
}

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
      | "contribution-step-missing"
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
  try {
    [base, head] = await Promise.all([
      gitLine(input.exec, ["rev-parse", "--verify", `${input.base}^{commit}`]),
      gitLine(input.exec, ["rev-parse", "--verify", `${input.head}^{commit}`]),
    ]);
  } catch {
    return { status: "refused", reason: "git-coordinate-unresolved" };
  }
  if (!await isAncestor(input.exec, base, head)) {
    return { status: "refused", reason: "base-not-ancestor" };
  }

  let commits: string[];
  try {
    commits = await gitLines(input.exec, [
      "rev-list", "--first-parent", "--reverse", head, "--not", base,
    ]);
  } catch {
    return { status: "refused", reason: "first-parent-history-malformed" };
  }
  if (commits.length === 0) {
    return { status: "refused", reason: "divergence-boundary-missing" };
  }
  const cumulativeSet = new Set<string>();
  const cumulativePaths: string[] = [];
  const steps: DeliveryBranchStep[] = [];
  const capabilities = { mergeTreeWriteTree: null as boolean | null };

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
    const classification = await classifyStep(input.exec, commit, parents, base, capabilities);
    if (classification.status === "refused") return classification;
    if (classification.value === "contribution") {
      for (const path of affectedPaths(changeSet.changes)) {
        if (cumulativeSet.has(path)) continue;
        cumulativeSet.add(path);
        insertCanonicalByteSorted(cumulativePaths, path);
      }
    }
    steps.push({
      commit,
      predecessor,
      parents,
      classification: classification.value,
      changeSet,
      cumulativePaths: [...cumulativePaths],
    });
  }
  const boundary = steps[0];
  if (boundary === undefined || !await isAncestor(input.exec, boundary.predecessor, base)) {
    return { status: "refused", reason: "divergence-boundary-missing" };
  }
  if (boundary.commit !== commits[0]) {
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
  if (inspection.contributionStepIds.length === 0) {
    return { status: "refused", reason: "contribution-step-missing" };
  }
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
    malformedTaskReferences: attribution.value.malformedTaskReferences,
    advisories: attribution.value.advisories,
    ...deriveBranchStructureReports(
      inspection.steps,
      lifecycleArtifactBasenames(input.workUnitId, design.inventory.artifacts.map(({ artifactId }) => artifactId)),
    ),
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
  const source = resolveDeliveryFromBranchSource(input.snapshot);
  if (source.status === "refused") return source;
  const { facts } = source.value;
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
        facts.taskAttributions,
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
      boundary: input.slots.boundary,
      contributionStepIds: facts.contributionStepIds,
      memberContributionSteps: segments.map((segment) => ({
        chunkKey: segment.chunkKey,
        contributionStepIds: segment.sourceIds,
      })),
      sourceAdvisories: facts.advisories,
    },
  };
}

function branchFactsMatchSnapshot(
  snapshot: DeliveryAuthoringSnapshotV1,
  facts: z.infer<typeof DeliveryFromBranchFactsSchema>,
  sourceInputs: z.infer<typeof DeliveryFromBranchSourceInputsSchema>,
): boolean {
  const first = facts.steps[0];
  if (first === undefined) return false;
  const stepIds = facts.steps.map((step) => step.commit);
  const contributionIds = facts.steps
    .filter((step) => step.classification === "contribution")
    .map((step) => step.commit);
  const attributionCommits = facts.taskAttributions.map((attribution) => attribution.commit);
  const attributionPositions = attributionCommits.map((commit) => contributionIds.indexOf(commit));
  const malformedCommits = facts.malformedTaskReferences.map((reference) => reference.commit);
  const malformedPositions = malformedCommits.map((commit) => contributionIds.indexOf(commit));
  const expectedAdvisories = [
    ...facts.taskAttributions.flatMap((attribution) => (
      attribution.unresolvedTaskIds.map((taskId) => ({
        kind: "unresolved-task-reference" as const,
        commit: attribution.commit,
        taskId,
      }))
    )),
    ...facts.malformedTaskReferences.map((reference) => ({
      kind: "malformed-task-reference" as const,
      commit: reference.commit,
      reference: reference.reference,
    })),
  ].sort((left, right) => contributionIds.indexOf(left.commit) - contributionIds.indexOf(right.commit));
  const expectedReports = deriveBranchStructureReports(
    facts.steps,
    lifecycleArtifactBasenames(
      snapshot.originalWorkUnitId,
      snapshot.design.artifacts.map(({ artifactId }) => artifactId),
    ),
  );
  return JSON.stringify(stepIds) === JSON.stringify(snapshot.source.identitySequence)
    && facts.base === sourceInputs.base
    && facts.head === sourceInputs.head
    && JSON.stringify(contributionIds) === JSON.stringify(facts.contributionStepIds)
    && attributionPositions.every((position, index) => position !== -1
      && (index === 0 || position > (attributionPositions[index - 1] ?? position)))
    && new Set(attributionCommits).size === attributionCommits.length
    && malformedPositions.every((position, index) => position !== -1
      && (index === 0 || position > (malformedPositions[index - 1] ?? position)))
    && new Set(malformedCommits).size === malformedCommits.length
    && JSON.stringify(expectedAdvisories) === JSON.stringify(facts.advisories)
    && JSON.stringify(expectedReports.coChangePairs) === JSON.stringify(facts.coChangePairs)
    && JSON.stringify(expectedReports.lifecycleArtifactTouches)
      === JSON.stringify(facts.lifecycleArtifactTouches)
    && first.predecessor === facts.originalDivergence.predecessor
    && first.commit === facts.originalDivergence.commit;
}

function deriveBranchStructureReports(
  steps: readonly DeliveryBranchStep[],
  lifecycleBasenames: ReadonlySet<string>,
): {
  readonly coChangePairs: readonly {
    readonly paths: readonly [string, string];
    readonly contributionStepIds: readonly string[];
  }[];
  readonly lifecycleArtifactTouches: readonly {
    readonly commit: string;
    readonly paths: readonly string[];
  }[];
} {
  const pairs = new Map<string, {
    readonly paths: readonly [string, string];
    readonly contributionStepIds: string[];
  }>();
  const lifecycleArtifactTouches: { readonly commit: string; readonly paths: readonly string[] }[] = [];
  for (const step of steps) {
    if (step.classification !== "contribution") continue;
    const paths = sortCanonicalBytes(new Set(affectedPaths(step.changeSet.changes)));
    for (let leftIndex = 0; leftIndex < paths.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < paths.length; rightIndex += 1) {
        const left = paths[leftIndex];
        const right = paths[rightIndex];
        if (left === undefined || right === undefined) continue;
        const key = JSON.stringify([left, right]);
        const existing = pairs.get(key);
        if (existing === undefined) {
          pairs.set(key, { paths: [left, right], contributionStepIds: [step.commit] });
        } else {
          existing.contributionStepIds.push(step.commit);
        }
      }
    }
    const lifecyclePaths = paths.filter((path) => lifecycleBasenames.has(artifactBasename(path)));
    if (lifecyclePaths.length > 0) {
      lifecycleArtifactTouches.push({ commit: step.commit, paths: lifecyclePaths });
    }
  }
  return {
    coChangePairs: [...pairs.values()]
      .map((pair) => ({
        paths: pair.paths,
        contributionStepIds: sortCanonicalBytes(pair.contributionStepIds),
      }))
      .sort((left, right) => comparePathPairs(left.paths, right.paths)),
    lifecycleArtifactTouches,
  };
}

function lifecycleArtifactBasenames(
  workUnitId: string,
  designArtifactIds: readonly string[],
): ReadonlySet<string> {
  return new Set([
    `meta-${workUnitId}.md`,
    `draft-${workUnitId}.md`,
    `spec-${workUnitId}.md`,
    `notes-${workUnitId}.md`,
    `tasks-${workUnitId}.md`,
    ...designArtifactIds,
  ]);
}

function comparePathPairs(left: readonly [string, string], right: readonly [string, string]): number {
  return Buffer.from(left[0]).compare(Buffer.from(right[0]))
    || Buffer.from(left[1]).compare(Buffer.from(right[1]));
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
    readonly malformedTaskReferences: readonly {
      readonly commit: string;
      readonly reference: string;
    }[];
    readonly advisories: readonly ({
      readonly kind: "unresolved-task-reference";
      readonly commit: string;
      readonly taskId: string;
    } | {
      readonly kind: "malformed-task-reference";
      readonly commit: string;
      readonly reference: string;
    })[];
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
  const malformedTaskReferences: { readonly commit: string; readonly reference: string }[] = [];
  const advisories: ({
    readonly kind: "unresolved-task-reference";
    readonly commit: string;
    readonly taskId: string;
  } | {
    readonly kind: "malformed-task-reference";
    readonly commit: string;
    readonly reference: string;
  })[] = [];
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
    if (reference === null) {
      if (referenceValue !== undefined) {
        malformedTaskReferences.push({ commit, reference: referenceValue });
        advisories.push({ kind: "malformed-task-reference", commit, reference: referenceValue });
      }
      continue;
    }
    const referencedTaskIds = expandTaskReference(reference, orderedTaskIds);
    const resolution = resolveToParentInventory(referencedTaskIds, parentTaskIds);
    taskAttributions.push({ commit, referencedTaskIds, ...resolution });
    advisories.push(...resolution.unresolvedTaskIds.map((taskId) => ({
      kind: "unresolved-task-reference" as const,
      commit,
      taskId,
    })));
  }
  return { status: "ok", value: { taskAttributions, malformedTaskReferences, advisories } };
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
  base: string,
  capabilities: { mergeTreeWriteTree: boolean | null },
): Promise<
  | { readonly status: "classified"; readonly value: DeliveryBranchStep["classification"] }
  | { readonly status: "refused"; readonly reason: InspectDeliveryBranchRefusal["reason"] }
> {
  if (parents.length === 1) return { status: "classified", value: "contribution" };
  if (parents.length !== 2) return { status: "refused", reason: "ambient-purity-unproven" };
  const secondParent = parents[1];
  if (secondParent === undefined || !await isAncestor(exec, secondParent, base)) {
    return { status: "classified", value: "contribution" };
  }
  if (capabilities.mergeTreeWriteTree === null) {
    capabilities.mergeTreeWriteTree = await supportsMergeTreeWriteTree(exec, parents[0] ?? "");
  }
  if (!capabilities.mergeTreeWriteTree) {
    return { status: "refused", reason: "merge-tree-write-tree-unsupported" };
  }
  try {
    const [expectedTreeOutput, actualTree] = await Promise.all([
      gitLines(exec, ["merge-tree", "--write-tree", parents[0] ?? "", secondParent]),
      gitLine(exec, ["rev-parse", `${commit}^{tree}`]),
    ]);
    const expectedTree = expectedTreeOutput.find((line) => /^[0-9a-f]{40,64}$/u.test(line));
    return expectedTree === actualTree
      ? { status: "classified", value: "ambient-base-absorb" }
      : { status: "refused", reason: "ambient-purity-unproven" };
  } catch {
    return { status: "refused", reason: "ambient-purity-unproven" };
  }
}

async function supportsMergeTreeWriteTree(exec: RawGitExec, commit: string): Promise<boolean> {
  try {
    const output = await gitLines(exec, ["merge-tree", "--write-tree", commit, commit]);
    return output.some((line) => /^[0-9a-f]{40,64}$/u.test(line));
  } catch {
    return false;
  }
}

async function isAncestor(exec: RawGitExec, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await exec(["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
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

function insertCanonicalByteSorted(values: string[], value: string): void {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = values[middle];
    if (candidate !== undefined && Buffer.from(candidate).compare(Buffer.from(value)) < 0) low = middle + 1;
    else high = middle;
  }
  values.splice(low, 0, value);
}
