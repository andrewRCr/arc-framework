/** Canonical delivery-plan assembly and offline revalidation. */

import {
  assertCanonicalDigest,
  canonicalDigest,
  canonicalize,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../kernel/index.js";
import {
  validateDesignElementCoverage,
  type BoundDesignInventory,
  type DesignElementCoverageIssue,
} from "./design-inventory.js";
import {
  validateDeliveryTaskCoverage,
  type DeliveryTaskCoverageAdvisory,
  type DeliveryTaskCoverageIssue,
} from "./coverage.js";
import {
  deriveMemberSemanticFingerprint,
  deriveSeamSchedule,
  deriveSeamSemanticFingerprint,
  type SeamScheduleResult,
} from "./fingerprint.js";
import {
  deriveUniqueDeliverableIds,
  resolveDeliveryPlanId,
} from "./identity.js";
import type { DeliveryTaskInventory } from "./task-inventory.js";
import {
  DeliveryPlanV1Schema,
  type DeliveryPlanAuthoringInputV1,
  type DeliveryPlanMemberV1,
  type DeliveryPlanV1,
} from "./schema.js";
import type { DeliveryPlanPayloadCodec } from "./ports.js";

interface AssembledDeliveryPlanSeam {
  readonly seamKey: string;
  readonly title: string;
  readonly acceptance: string;
  readonly incidentDeliverableIds: readonly CanonicalDigest[];
  readonly ownerDeliverableId: CanonicalDigest;
  readonly designElementIds: readonly string[];
  readonly semanticFingerprint: CanonicalDigest;
}

/** Inputs required to assemble one immutable delivery-plan revision. */
export interface ConstructDeliveryPlanRevisionInput {
  readonly authoring: DeliveryPlanAuthoringInputV1;
  readonly taskInventory: DeliveryTaskInventory;
  readonly designInventory: BoundDesignInventory;
  readonly predecessor: DeliveryPlanV1 | null;
  readonly mintPlanId: () => string;
}

type SeamScheduleIssueCode = `seam-${Extract<
  SeamScheduleResult,
  { readonly status: "refused" }
>["reason"]}`;

/** Closed plan construction and validation refusal vocabulary. */
export type DeliveryPlanIssueCode =
  | "task-inventory-binding-mismatch"
  | "design-inventory-binding-mismatch"
  | "duplicate-member-identity"
  | SeamScheduleIssueCode
  | "structural-invalid"
  | "plan-digest-mismatch"
  | "task-inventory-digest-mismatch"
  | "duplicate-task-id"
  | "verification-task-in-implementation"
  | "duplicate-artifact-id"
  | "duplicate-design-element-id"
  | "duplicate-member-chunk-key"
  | "duplicate-deliverable-id"
  | "duplicate-seam-key"
  | "duplicate-member-task-id"
  | "duplicate-member-design-element-id"
  | "duplicate-seam-design-element-id"
  | "normalization-mismatch"
  | "identity-mismatch"
  | "seam-incidence-invalid"
  | "seam-incidence-order-mismatch"
  | "seam-owner-mismatch"
  | "seam-fingerprint-mismatch"
  | "stack-member-not-landable"
  | "member-fingerprint-mismatch"
  | "first-revision-lineage-mismatch"
  | "plan-id-lineage-mismatch"
  | "project-id-lineage-mismatch"
  | "work-unit-id-lineage-mismatch"
  | "plan-revision-lineage-mismatch"
  | "predecessor-digest-mismatch"
  | DeliveryTaskCoverageIssue["kind"]
  | DesignElementCoverageIssue["kind"];

/** One typed plan construction or validation defect. */
export interface DeliveryPlanIssue {
  readonly code: DeliveryPlanIssueCode;
  readonly path?: readonly (string | number)[];
}

/** Result of constructing and validating one plan revision. */
export type ConstructDeliveryPlanRevisionResult =
  | {
    readonly status: "constructed";
    readonly plan: DeliveryPlanV1;
    readonly advisories: readonly DeliveryTaskCoverageAdvisory[];
  }
  | { readonly status: "refused"; readonly issues: readonly DeliveryPlanIssue[] };

/** Result of offline revalidation against an optional validated predecessor. */
export type DeliveryPlanValidationResult =
  | {
    readonly status: "valid";
    readonly plan: DeliveryPlanV1;
    readonly advisories: readonly DeliveryTaskCoverageAdvisory[];
  }
  | { readonly status: "refused"; readonly issues: readonly DeliveryPlanIssue[] };

/** Persisted canonical-plan codec with predecessor-aware publication validation. */
export const DeliveryPlanV1Codec: DeliveryPlanPayloadCodec<DeliveryPlanV1> = {
  decode: (value) => {
    const validation = validateDeliveryPlanRecord(value);
    return validation.status === "valid"
      ? { status: "decoded", value: validation.plan }
      : { status: "refused" };
  },
  planId: (value) => value.planId,
  digest: (value) => asCanonicalDigest(value.planDigest),
  isValidSuccessor: (current, proposed) => validateDeliveryPlanRevision(proposed, current).status === "valid",
};

/**
 * Assemble and validate one canonical delivery-plan revision.
 *
 * @param input - Validated authoring input, inventories, predecessor, and plan-id mint
 * @returns A complete immutable plan or typed refusal issues
 */
export function constructDeliveryPlanRevision(
  input: ConstructDeliveryPlanRevisionInput,
): ConstructDeliveryPlanRevisionResult {
  if (canonicalize({
    implementation: input.authoring.tasks.implementation.map((task) => task.taskId),
    verificationTaskId: input.authoring.tasks.verificationTaskId,
  }) !== canonicalize({
    implementation: input.taskInventory.implementation.map((task) => task.taskId),
    verificationTaskId: input.taskInventory.verificationTaskId,
  })) {
    return { status: "refused", issues: [{ code: "task-inventory-binding-mismatch" }] };
  }
  if (canonicalize({
    artifacts: input.authoring.design.artifacts.map((artifact) => artifact.artifactId),
    elements: input.authoring.design.elements.map((element) => element.elementId),
  }) !== canonicalize({
    artifacts: input.designInventory.artifacts.map((artifact) => artifact.artifactId),
    elements: input.designInventory.elements.map((element) => element.elementId),
  })) {
    return { status: "refused", issues: [{ code: "design-inventory-binding-mismatch" }] };
  }
  const planId = resolveDeliveryPlanId(input.predecessor, input.mintPlanId);
  let deliverableIds: readonly CanonicalDigest[];
  try {
    deliverableIds = deriveUniqueDeliverableIds(
      planId,
      input.authoring.members.map((member) => member.chunkKey),
    );
  } catch {
    return { status: "refused", issues: [{ code: "duplicate-member-identity" }] };
  }

  const deliverableIdByChunkKey = new Map(input.authoring.members.map((member, index) => [
    member.chunkKey,
    deliverableIds[index],
  ]));
  const seams: AssembledDeliveryPlanSeam[] = [];
  for (const authoredSeam of input.authoring.seams) {
    const incidents = authoredSeam.incidentChunkKeys.map((chunkKey) => (
      deliverableIdByChunkKey.get(chunkKey)
    )).filter((deliverableId): deliverableId is CanonicalDigest => deliverableId !== undefined);
    const schedule = deriveSeamSchedule(deliverableIds, incidents);
    if (schedule.status === "refused") {
      return { status: "refused", issues: [{ code: `seam-${schedule.reason}` }] };
    }
    seams.push({
      seamKey: authoredSeam.seamKey,
      title: authoredSeam.title,
      acceptance: authoredSeam.acceptance,
      incidentDeliverableIds: schedule.incidentDeliverableIds,
      ownerDeliverableId: schedule.ownerDeliverableId,
      designElementIds: sortByCanonicalBytes(authoredSeam.designElementIds),
      semanticFingerprint: deriveSeamSemanticFingerprint({
        title: authoredSeam.title,
        acceptance: authoredSeam.acceptance,
        incidentDeliverableIds: schedule.incidentDeliverableIds,
      }),
    });
  }
  const normalizedSeams = sortByCanonicalBytes(seams);
  const taskById = new Map(input.taskInventory.implementation.map((task) => [task.taskId, task]));
  const designById = new Map(input.designInventory.elements.map((element) => [element.elementId, element]));
  const members: DeliveryPlanMemberV1[] = input.authoring.members.map((member, index) => {
    const deliverableId = deliverableIds[index];
    if (deliverableId === undefined) throw new Error("deliverable identity sequence lost member order");
    const taskIds = sortByCanonicalBytes(member.taskIds);
    const designElementIds = sortByCanonicalBytes(member.designElementIds);
    const semanticFingerprint = deriveMemberSemanticFingerprint({
      title: member.title,
      contract: member.contract,
      tasks: taskIds.map((taskId) => taskById.get(taskId))
        .filter((task): task is NonNullable<typeof task> => task !== undefined),
      designElements: designElementIds.map((elementId) => designById.get(elementId))
        .filter((element): element is NonNullable<typeof element> => element !== undefined),
      mainlineLandability: member.mainlineLandability,
      incidentSeams: normalizedSeams
        .filter((seam) => seam.incidentDeliverableIds.includes(deliverableId))
        .map((seam) => ({
          seamKey: seam.seamKey,
          semanticFingerprint: seam.semanticFingerprint,
        })),
    });
    return {
      chunkKey: member.chunkKey,
      deliverableId,
      title: member.title,
      contract: member.contract,
      taskIds,
      designElementIds,
      mainlineLandability: member.mainlineLandability,
      semanticFingerprint,
    };
  });

  const preimage = {
    schemaVersion: 1 as const,
    semanticsVersion: "delivery-plan/v1" as const,
    ...(input.authoring.projectId === undefined ? {} : { projectId: input.authoring.projectId }),
    workUnitId: input.authoring.workUnitId,
    planId,
    planRevision: input.predecessor === null ? 1 : input.predecessor.planRevision + 1,
    previousPlanDigest: input.predecessor?.planDigest ?? null,
    design: {
      artifacts: input.designInventory.artifacts.map((artifact) => ({ ...artifact })),
      elements: input.designInventory.elements.map((element) => ({ ...element })),
    },
    tasks: {
      inventoryDigest: input.taskInventory.inventoryDigest,
      implementation: input.taskInventory.implementation.map((task) => ({ ...task })),
      verificationTaskId: input.taskInventory.verificationTaskId,
    },
    entry: input.authoring.entry,
    projection: input.authoring.projection,
    members,
    seams: normalizedSeams,
  };
  const parsed = DeliveryPlanV1Schema.safeParse({
    ...preimage,
    planDigest: deriveDeliveryPlanDigest(preimage),
  });
  if (!parsed.success) {
    return { status: "refused", issues: [{ code: "structural-invalid" }] };
  }
  const validation = validateDeliveryPlanRevision(parsed.data, input.predecessor);
  if (validation.status === "refused") return validation;
  return {
    status: "constructed",
    plan: validation.plan,
    advisories: validation.advisories,
  };
}

/**
 * Derive a plan digest from every canonical record field except the digest itself.
 *
 * @param plan - Complete plan or digest-free plan preimage
 * @returns Canonical digest of the complete self-excluding record
 */
export function deriveDeliveryPlanDigest(
  plan: object,
): CanonicalDigest {
  const preimage: Record<string, unknown> = { ...plan };
  delete preimage.planDigest;
  return canonicalDigest(preimage);
}

/**
 * Revalidate every self-contained whole-record refinement available from a persisted plan.
 *
 * @param value - Candidate delivery-plan record
 * @returns Parsed record with advisories or typed refinement issues
 */
export function validateDeliveryPlanRecord(value: unknown): DeliveryPlanValidationResult {
  const parsed = DeliveryPlanV1Schema.safeParse(value);
  if (!parsed.success) {
    return { status: "refused", issues: [{ code: "structural-invalid" }] };
  }
  const plan = parsed.data;
  const issues: DeliveryPlanIssue[] = [];

  if (deriveDeliveryPlanDigest(plan) !== plan.planDigest) {
    issues.push({ code: "plan-digest-mismatch", path: ["planDigest"] });
  }
  if (canonicalDigest(plan.tasks.implementation) !== plan.tasks.inventoryDigest) {
    issues.push({ code: "task-inventory-digest-mismatch", path: ["tasks", "inventoryDigest"] });
  }

  collectUniquenessIssues(plan, issues);
  collectNormalizationIssues(plan, issues);
  collectIdentityIssues(plan, issues);
  collectSeamIssues(plan, issues);
  collectProjectionIssues(plan, issues);
  collectMemberFingerprintIssues(plan, issues);

  const taskCoverage = validateDeliveryTaskCoverage({
    entry: plan.entry,
    predecessorEntry: null,
    implementationTaskIds: plan.tasks.implementation.map((task) => task.taskId),
    verificationTaskId: plan.tasks.verificationTaskId,
    memberTaskIds: plan.members.map((member) => member.taskIds),
  });
  const advisories = taskCoverage.status === "valid" ? taskCoverage.advisories : [];
  if (taskCoverage.status === "refused") {
    issues.push(...taskCoverage.issues.map((issue) => ({
      code: issue.kind,
      ...(issue.kind === "uncovered-implementation-task" || issue.kind === "unknown-task-reference"
        ? { path: ["tasks", issue.taskId] }
        : {}),
    })));
  }

  const designCoverage = validateDesignElementCoverage({
    inventory: {
      artifacts: plan.design.artifacts.map((artifact) => ({
        artifactId: artifact.artifactId,
        revisionDigest: asCanonicalDigest(artifact.revisionDigest),
      })),
      elements: plan.design.elements.map((element) => ({
        elementId: element.elementId,
        semanticDigest: asCanonicalDigest(element.semanticDigest),
      })),
    },
    memberDesignElementIds: plan.members.map((member) => member.designElementIds),
    seamDesignElementIds: plan.seams.map((seam) => seam.designElementIds),
  });
  if (designCoverage.status === "refused") {
    issues.push(...designCoverage.issues.map((issue) => ({
      code: issue.kind,
      path: ["design", issue.elementId],
    })));
  }

  if (issues.length > 0) return { status: "refused", issues };
  return { status: "valid", plan, advisories };
}

/**
 * Revalidate a plan's self-contained refinements and its exact predecessor transition.
 *
 * @param value - Candidate delivery-plan record
 * @param predecessor - Validated preceding revision, or `null` for revision one
 * @returns Parsed record with advisories or typed refinement issues
 */
export function validateDeliveryPlanRevision(
  value: unknown,
  predecessor: DeliveryPlanV1 | null,
): DeliveryPlanValidationResult {
  const record = validateDeliveryPlanRecord(value);
  const parsed = DeliveryPlanV1Schema.safeParse(value);
  if (!parsed.success) return record;
  const plan = parsed.data;

  const issues: DeliveryPlanIssue[] = record.status === "refused" ? [...record.issues] : [];
  if (predecessor !== null) {
    if (plan.entry !== predecessor.entry) {
      issues.push({ code: "entry-changed" });
    }
  }
  collectLineageIssues(plan, predecessor, issues);

  if (issues.length > 0) return { status: "refused", issues };
  if (record.status === "refused") return record;
  return record;
}

function collectUniquenessIssues(plan: DeliveryPlanV1, issues: DeliveryPlanIssue[]): void {
  collectDuplicateIssue(plan.tasks.implementation.map((task) => task.taskId), "duplicate-task-id", issues);
  if (plan.tasks.implementation.some((task) => task.taskId === plan.tasks.verificationTaskId)) {
    issues.push({
      code: "verification-task-in-implementation",
      path: ["tasks", "verificationTaskId"],
    });
  }
  collectDuplicateIssue(plan.design.artifacts.map((artifact) => artifact.artifactId), "duplicate-artifact-id", issues);
  collectDuplicateIssue(plan.design.elements.map((element) => element.elementId), "duplicate-design-element-id", issues);
  collectDuplicateIssue(plan.members.map((member) => member.chunkKey), "duplicate-member-chunk-key", issues);
  collectDuplicateIssue(plan.members.map((member) => member.deliverableId), "duplicate-deliverable-id", issues);
  collectDuplicateIssue(plan.seams.map((seam) => seam.seamKey), "duplicate-seam-key", issues);
  for (const [index, member] of plan.members.entries()) {
    collectDuplicateIssue(member.taskIds, "duplicate-member-task-id", issues, ["members", index, "taskIds"]);
    collectDuplicateIssue(
      member.designElementIds,
      "duplicate-member-design-element-id",
      issues,
      ["members", index, "designElementIds"],
    );
  }
  for (const [index, seam] of plan.seams.entries()) {
    collectDuplicateIssue(
      seam.designElementIds,
      "duplicate-seam-design-element-id",
      issues,
      ["seams", index, "designElementIds"],
    );
  }
}

function collectNormalizationIssues(plan: DeliveryPlanV1, issues: DeliveryPlanIssue[]): void {
  for (const [index, member] of plan.members.entries()) {
    if (!isCanonicallySorted(member.taskIds)) {
      issues.push({ code: "normalization-mismatch", path: ["members", index, "taskIds"] });
    }
    if (!isCanonicallySorted(member.designElementIds)) {
      issues.push({ code: "normalization-mismatch", path: ["members", index, "designElementIds"] });
    }
  }
  for (const [index, seam] of plan.seams.entries()) {
    if (!isCanonicallySorted(seam.designElementIds)) {
      issues.push({ code: "normalization-mismatch", path: ["seams", index, "designElementIds"] });
    }
  }
  if (!isCanonicallySorted(plan.seams)) {
    issues.push({ code: "normalization-mismatch", path: ["seams"] });
  }
}

function isCanonicallySorted(values: readonly unknown[]): boolean {
  return canonicalize(values) === canonicalize(sortByCanonicalBytes(values));
}

function collectDuplicateIssue(
  values: readonly string[],
  code: DeliveryPlanIssueCode,
  issues: DeliveryPlanIssue[],
  path?: readonly (string | number)[],
): void {
  if (new Set(values).size !== values.length) issues.push({ code, ...(path === undefined ? {} : { path }) });
}

function collectIdentityIssues(plan: DeliveryPlanV1, issues: DeliveryPlanIssue[]): void {
  for (const [index, member] of plan.members.entries()) {
    const deliverableId = deriveUniqueDeliverableIds(plan.planId, [member.chunkKey])[0];
    if (deliverableId !== member.deliverableId) {
      issues.push({ code: "identity-mismatch", path: ["members", index, "deliverableId"] });
    }
  }
}

function collectSeamIssues(plan: DeliveryPlanV1, issues: DeliveryPlanIssue[]): void {
  const memberOrder = plan.members.map((member) => asCanonicalDigest(member.deliverableId));
  for (const [index, seam] of plan.seams.entries()) {
    const schedule = deriveSeamSchedule(
      memberOrder,
      seam.incidentDeliverableIds.map(asCanonicalDigest),
    );
    if (schedule.status === "refused") {
      issues.push({ code: "seam-incidence-invalid", path: ["seams", index, "incidentDeliverableIds"] });
      continue;
    }
    if (canonicalize(schedule.incidentDeliverableIds) !== canonicalize(seam.incidentDeliverableIds)) {
      issues.push({ code: "seam-incidence-order-mismatch", path: ["seams", index, "incidentDeliverableIds"] });
    }
    if (schedule.ownerDeliverableId !== seam.ownerDeliverableId) {
      issues.push({ code: "seam-owner-mismatch", path: ["seams", index, "ownerDeliverableId"] });
    }
    const fingerprint = deriveSeamSemanticFingerprint({
      title: seam.title,
      acceptance: seam.acceptance,
      incidentDeliverableIds: schedule.incidentDeliverableIds,
    });
    if (fingerprint !== seam.semanticFingerprint) {
      issues.push({ code: "seam-fingerprint-mismatch", path: ["seams", index, "semanticFingerprint"] });
    }
  }
}

function collectProjectionIssues(plan: DeliveryPlanV1, issues: DeliveryPlanIssue[]): void {
  if (plan.projection.kind !== "stack-to-main") return;
  for (const [index, member] of plan.members.entries()) {
    if (member.mainlineLandability !== "independently-landable") {
      issues.push({ code: "stack-member-not-landable", path: ["members", index, "mainlineLandability"] });
    }
  }
}

function collectMemberFingerprintIssues(plan: DeliveryPlanV1, issues: DeliveryPlanIssue[]): void {
  const taskById = new Map(plan.tasks.implementation.map((task) => [task.taskId, task]));
  const designById = new Map(plan.design.elements.map((element) => [element.elementId, element]));
  for (const [index, member] of plan.members.entries()) {
    const expected = deriveMemberSemanticFingerprint({
      title: member.title,
      contract: member.contract,
      tasks: member.taskIds.flatMap((taskId) => {
        const task = taskById.get(taskId);
        return task === undefined ? [] : [{
          taskId: task.taskId,
          semanticDigest: asCanonicalDigest(task.semanticDigest),
        }];
      }),
      designElements: member.designElementIds.flatMap((elementId) => {
        const element = designById.get(elementId);
        return element === undefined ? [] : [{
          elementId: element.elementId,
          semanticDigest: asCanonicalDigest(element.semanticDigest),
        }];
      }),
      mainlineLandability: member.mainlineLandability,
      incidentSeams: plan.seams
        .filter((seam) => seam.incidentDeliverableIds.includes(member.deliverableId))
        .map((seam) => ({
          seamKey: seam.seamKey,
          semanticFingerprint: asCanonicalDigest(seam.semanticFingerprint),
        })),
    });
    if (expected !== member.semanticFingerprint) {
      issues.push({ code: "member-fingerprint-mismatch", path: ["members", index, "semanticFingerprint"] });
    }
  }
}

function collectLineageIssues(
  plan: DeliveryPlanV1,
  predecessor: DeliveryPlanV1 | null,
  issues: DeliveryPlanIssue[],
): void {
  if (predecessor === null) {
    if (plan.planRevision !== 1) {
      issues.push({ code: "first-revision-lineage-mismatch", path: ["planRevision"] });
    }
    if (plan.previousPlanDigest !== null) {
      issues.push({ code: "first-revision-lineage-mismatch", path: ["previousPlanDigest"] });
    }
    return;
  }
  if (plan.planId !== predecessor.planId) {
    issues.push({ code: "plan-id-lineage-mismatch", path: ["planId"] });
  }
  if (plan.projectId !== predecessor.projectId) {
    issues.push({ code: "project-id-lineage-mismatch", path: ["projectId"] });
  }
  if (plan.workUnitId !== predecessor.workUnitId) {
    issues.push({ code: "work-unit-id-lineage-mismatch", path: ["workUnitId"] });
  }
  if (plan.planRevision !== predecessor.planRevision + 1) {
    issues.push({ code: "plan-revision-lineage-mismatch", path: ["planRevision"] });
  }
  if (plan.previousPlanDigest !== predecessor.planDigest) {
    issues.push({ code: "predecessor-digest-mismatch", path: ["previousPlanDigest"] });
  }
}

function asCanonicalDigest(value: string): CanonicalDigest {
  assertCanonicalDigest(value);
  return value;
}
