/** Strict CLI composition for delivery execution services. */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import {
  declareCliOperandSite,
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  closeDeliveryEligibility,
  executeWithFreshDeliveryEligibility,
  prepareDeliveryEligibility,
  type DeliveryEligibilitySnapshot,
} from "../lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../lib/delivery/git-eligibility.js";
import { revalidateDeliveryLifecycleContribution } from "../lib/delivery/git-lifecycle-contribution.js";
import { CurrentDeliveryLifecycleContributionPathSource } from "../lib/delivery/lifecycle-contribution.js";
import { observeRepositoryDeliveryPosition } from "../lib/session-init/delivery-position-facts.js";
import { proveGitDeliveryContribution } from "../lib/delivery/git-contribution-proof.js";
import {
  deleteDeliveryRemoteRef,
  observeDeliveryRemoteRef,
  publishDeliveryRemoteRef,
  rewriteDeliveryRemoteRef,
} from "../lib/delivery/git-materialization.js";
import {
  bindInitialDeliveryRef,
  bindInitialDeliveryRequest,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
  publishDeliveryRequests,
} from "../lib/delivery/materialization.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import { DeliveryPositionFactsV1Schema, deriveDeliveryPosition } from "../lib/delivery/position.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../lib/delivery/local-stores.js";
import {
  DeliveryCanonicalDigestSchema,
  DeliveryOperationSnapshotV1Schema,
  DeliveryPlanIdSchema,
  DeliveryPlanV1Schema,
  DeliveryStateV1Schema,
} from "../lib/delivery/schema.js";
import {
  applyDeliveryLanding,
  prepareDeliveryLanding,
  reconcileDeliveryExecution,
} from "../lib/delivery/landing.js";
import {
  executeDeliverySuffixRewrite,
} from "../lib/delivery/suffix-reconciliation.js";
import { executeFreshDeliverySuffixRematerialization } from "../lib/delivery/suffix-rematerialization.js";
import { teardownLandedDeliveryMember } from "../lib/delivery/teardown.js";
import {
  degradeNativeDeliveryStack,
  linkDeliveryNativeStack,
  observeDeliveryNativeStack,
} from "../lib/delivery/native-stack.js";
import {
  reconcileLinkedNativeDeliverySuffix,
  reconcileReservedNativeDeliveryMerge,
  reserveNativeDeliveryLanding,
  selectNativeDeliveryLandingArm,
  submitReservedNativeDeliveryMerge,
} from "../lib/delivery/native-landing.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { validateManagedPath } from "../lib/kernel/index.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import { readAncestry } from "../lib/work-unit/git-decomposition-object-readers.js";
import { createGitExec, createRawGitExec } from "../lib/io-context.js";
import { GhDeliveryHostPort } from "../scripts/delivery/hosts/github.js";
import { releaseMergeLock } from "../scripts/review-gate/merge-lock.js";
import { evaluateReviewReadiness } from "../scripts/review-gate/readiness.js";
import { RepositoryDeliveryMemberLookup } from "../scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { hostedGhRunner } from "../scripts/review-gate/hosted/gh-process.js";
import { defaultMergeLockPort } from "./review.js";
import { requireArcProjectRoot } from "./shared.js";

const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const RefSchema = z.string().startsWith("refs/");
const CandidateSchema = z.strictObject({ deliverableId: DeliveryCanonicalDigestSchema, ref: RefSchema });
const CoordinateSchema = z.strictObject({ head: GitObjectIdSchema, tree: GitObjectIdSchema });
const EligibilityMemberSchema = CandidateSchema.extend(CoordinateSchema.shape);
const EligibilitySnapshotSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  workUnitId: z.string().min(1),
  planRevision: z.number().int().positive(),
  planDigest: DeliveryCanonicalDigestSchema,
  protectedBase: CoordinateSchema.extend({ ref: RefSchema }),
  control: CoordinateSchema.extend({ ref: RefSchema }),
  members: z.array(EligibilityMemberSchema).min(1),
  lifecyclePaths: z.array(z.string().min(1)),
});

const PrepareSchema = z.strictObject({
  plan: DeliveryPlanV1Schema,
  protectedBaseRef: RefSchema,
  controlRef: RefSchema,
  candidates: z.array(CandidateSchema).min(1),
  lifecyclePaths: z.array(z.string().min(1)),
});
const CloseSchema = z.strictObject({ snapshot: EligibilitySnapshotSchema });
const MutationCandidateSchema = CandidateSchema.extend({ checkoutPath: z.string().min(1) });
const MaterializeSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  protectedBaseRef: RefSchema,
  controlRef: RefSchema,
  candidates: z.array(MutationCandidateSchema).min(1),
  remote: z.string().min(1).default("origin"),
});
const PublishSchema = MaterializeSchema.extend({
  repository: z.string().min(1),
  draft: z.boolean(),
});
const PositionSchema = z.strictObject({ planId: DeliveryPlanIdSchema, facts: z.unknown() });
const ReconcileSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  repository: z.string().min(1),
  remote: z.string().min(1).default("origin"),
});
const PreparedLandingSchema = z.strictObject({
  operationId: z.string().min(1),
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  head: GitObjectIdSchema,
  repository: z.string().min(1),
  changeRequestId: z.string().min(1),
  mergeStrategy: z.enum(["merge", "rebase", "squash"]),
  settledReviewState: z.string().min(1),
  consequence: z.string().min(1),
  releaseMergeLock: z.boolean(),
});
const LandPrepareSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  facts: DeliveryPositionFactsV1Schema,
  selectedDeliverableId: DeliveryCanonicalDigestSchema,
  repository: z.string().min(1),
  baseRef: RefSchema,
  targetRef: RefSchema,
  mergeStrategy: z.enum(["merge", "rebase", "squash"]),
  releaseMergeLock: z.boolean(),
  treeRoot: z.string().min(1),
});
const LandApplySchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  approved: PreparedLandingSchema,
  remote: z.string().min(1).default("origin"),
  treeRoot: z.string().min(1),
});
const ContributionCoordinateSchema = z.strictObject({ head: GitObjectIdSchema, tree: GitObjectIdSchema });
const ContributionEndpointsSchema = z.strictObject({
  before: z.strictObject({ predecessor: ContributionCoordinateSchema, member: ContributionCoordinateSchema }),
  after: z.strictObject({ predecessor: ContributionCoordinateSchema, member: ContributionCoordinateSchema }),
});
const RewriteSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  requested: DeliveryOperationSnapshotV1Schema,
  candidateRef: RefSchema,
  protectedBaseRef: RefSchema,
  lifecyclePaths: z.array(z.string().min(1)),
  remote: z.string().min(1).default("origin"),
  contributionMode: z.enum(["prove-equivalent", "selected-change"]),
  contribution: ContributionEndpointsSchema,
});
const RematerializeSchema = MaterializeSchema.extend({
  selectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema).min(1),
  repository: z.string().min(1),
});
const TeardownSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  deliverableId: DeliveryCanonicalDigestSchema,
  facts: DeliveryPositionFactsV1Schema,
  repository: z.string().min(1),
  protectedTargetRef: RefSchema,
  remote: z.string().min(1).default("origin"),
});
const NativeMemberSchema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  changeRequestId: z.string().min(1),
  headRef: z.string().min(1),
  headSha: GitObjectIdSchema,
  baseRef: z.string().min(1),
  headRepository: z.string().min(1).optional(),
});
const NativeObserveSchema = z.strictObject({
  repository: z.string().min(1),
  members: z.array(NativeMemberSchema).min(2),
});
const NativeLinkSchema = NativeObserveSchema.extend({ optIn: z.boolean() });
const NativeLandingMemberSchema = z.strictObject({
  deliverableId: DeliveryCanonicalDigestSchema,
  changeRequestId: z.string().min(1),
  headSha: GitObjectIdSchema,
});
const NativeSelectSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  facts: DeliveryPositionFactsV1Schema,
  repository: z.string().min(1),
  mergeStrategy: z.enum(["merge", "rebase", "squash"]),
  mergeAction: z.enum(["direct", "queue"]),
  explicitAtomic: z.boolean(),
  members: z.array(NativeMemberSchema).min(1),
});
const NativeSelectionSchema = z.strictObject({
  status: z.literal("selected"),
  arm: z.enum(["unlinked", "linked-single", "linked-atomic"]),
  members: z.array(NativeLandingMemberSchema).min(1),
  recommendedActionText: z.string().min(1),
});
const NativePrepareSchema = z.strictObject({
  planId: DeliveryPlanIdSchema, operationId: z.string().min(1), selection: NativeSelectionSchema,
  facts: DeliveryPositionFactsV1Schema, repository: z.string().min(1), baseRef: z.string().min(1),
  targetRef: RefSchema, treeRoot: z.string().min(1),
});
const NativeMergeRequestSchema = z.strictObject({
  repository: z.string().min(1), topChangeRequestId: z.string().min(1), topHeadSha: GitObjectIdSchema,
  mergeAction: z.literal("direct_merge"), mergeMethod: z.literal("merge"),
});
const NativeSubmitSchema = z.strictObject({
  planId: DeliveryPlanIdSchema, operationId: z.string().min(1), request: NativeMergeRequestSchema,
  treeRoot: z.string().min(1),
});
const NativeStatusSchema = z.strictObject({
  planId: DeliveryPlanIdSchema,
  request: NativeMergeRequestSchema,
  remote: z.string().min(1).default("origin"),
});

const RequestSchemas = {
  "eligibility-prepare": PrepareSchema,
  "eligibility-close": CloseSchema,
  materialize: MaterializeSchema,
  publish: PublishSchema,
  position: PositionSchema,
  "land-prepare": LandPrepareSchema,
  "land-apply": LandApplySchema,
  reconcile: ReconcileSchema,
  rematerialize: RematerializeSchema,
  rewrite: RewriteSchema,
  teardown: TeardownSchema,
  "native-observe": NativeObserveSchema,
  "native-link": NativeLinkSchema,
  "native-unlink": NativeObserveSchema,
  "native-land-select": NativeSelectSchema,
  "native-land-prepare": NativePrepareSchema,
  "native-land-submit": NativeSubmitSchema,
  "native-land-status": NativeStatusSchema,
} as const;

export type DeliveryExecutionCommand = keyof typeof RequestSchemas;

const ResultSchema = z.union([
  z.strictObject({ status: z.literal("prepared"), snapshot: EligibilitySnapshotSchema }),
  z.strictObject({ status: z.literal("eligible"), snapshot: EligibilitySnapshotSchema }),
  z.strictObject({ status: z.literal("materialized"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("published"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("prepared"), presentation: PreparedLandingSchema }),
  z.strictObject({ status: z.literal("landed"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("position"), position: z.unknown(), nextAction: z.string().min(1) }),
  z.strictObject({ status: z.literal("applied"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("rematerialized"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("retryable"), guidance: z.string().min(1) }),
  z.strictObject({ status: z.literal("blocked"), guidance: z.string().min(1) }),
  z.strictObject({ status: z.literal("blocked"), reason: z.string().min(1), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("blocked"), reason: z.string().min(1), reservation: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("torn-down"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("registered"), stackNumber: z.number().int().positive() }),
  z.strictObject({ status: z.literal("unregistered") }),
  z.strictObject({ status: z.enum(["partial", "incoherent"]), affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema) }),
  z.strictObject({ status: z.enum(["unsupported", "unavailable", "malformed", "ambiguous"]) }),
  z.strictObject({ status: z.literal("linked"), stackNumber: z.number().int().positive(), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("unlinked"), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("downgrade-required"), reason: z.string().min(1), recommendedActionText: z.string().min(1) }),
  NativeSelectionSchema,
  z.strictObject({ status: z.literal("prepared"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }), operationId: z.string().min(1), members: z.array(NativeLandingMemberSchema), consequence: z.string().min(1) }),
  z.strictObject({ status: z.literal("pending"), effectIdentity: z.string().min(1), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("pending"), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("refused") }),
  z.strictObject({ status: z.literal("refused"), reason: z.string().min(1), deliverableId: DeliveryCanonicalDigestSchema.optional() }),
]);
export type DeliveryExecutionResult = z.infer<typeof ResultSchema>;

export interface DeliveryExecutionOptions { readonly input?: string; readonly json?: boolean }

function deliveryExecutionInputOptionSchema() {
  return z.strictObject({ input: z.string().min(1), json: z.boolean().optional() });
}

const InputOptionSchema = deliveryExecutionInputOptionSchema();

export const deliveryExecutionCommandInputRegistrations = Object.keys(RequestSchemas).map((command) => ({
  commandPath: executionPath(command as DeliveryExecutionCommand),
  schema: deliveryExecutionInputOptionSchema(),
  schemaFields: { "operand.input": "input", "option.json": "json" },
})) satisfies readonly CommandInputRegistration[];

export const deliveryExecutionCommandInputPolicyDeclarations = Object.keys(RequestSchemas).map((command) => ({
  commandPath: executionPath(command as DeliveryExecutionCommand),
  aliases: [],
  sites: [
    declareCliOperandSite("input", {
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "input",
      cancellation: "not-applicable",
      automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["<json-path>", "-"] },
      mutationBoundary: "delivery execution request validation",
      subprocess: "explicit-stdin",
    }),
    declareCliOptionSite("json", {
      acquisition: "machine-mode",
      schemaOwnership: "owned",
      schemaField: "json",
      cancellation: "not-applicable",
      automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection",
      subprocess: "none",
    }),
    ...(command === "eligibility-prepare" ? [declareInteractionSite(
      { file: "handlers/delivery-execution.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
      {
        acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "delivery execution request read", subprocess: "explicit-stdin",
      },
    )] : []),
  ],
})) satisfies readonly CommandInputDeclaration[];

function executionPath(command: DeliveryExecutionCommand): string {
  if (command.startsWith("eligibility-")) return `delivery eligibility ${command.slice("eligibility-".length)}`;
  if (command.startsWith("land-")) return `delivery land ${command.slice("land-".length)}`;
  if (command.startsWith("native-")) return `delivery native ${command.slice("native-".length)}`;
  return `delivery ${command}`;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface DeliveryExecutionHandlerDependencies {
  readText(source: string): Promise<string>;
  execute(command: DeliveryExecutionCommand, request: unknown, interaction?: InteractionContext): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultDependencies(): DeliveryExecutionHandlerDependencies {
  return {
    readText: (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    execute: executeDeliveryCommand,
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
  };
}

/** Validate one verb request, execute its domain service, and preserve its exact closed result. */
export async function handleDeliveryExecution(
  command: DeliveryExecutionCommand,
  opts: DeliveryExecutionOptions,
  interaction?: InteractionContext,
  overrides: Partial<DeliveryExecutionHandlerDependencies> = {},
): Promise<void> {
  const deps = { ...defaultDependencies(), ...overrides };
  const options = InputOptionSchema.safeParse(opts);
  if (!options.success) {
    emit(deps, command, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(await deps.readText(options.data.input));
  } catch {
    emit(deps, command, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  const request = RequestSchemas[command].safeParse(decoded);
  if (!request.success) {
    emit(deps, command, { status: "refused", reason: "invalid-command-input" });
    return;
  }
  let result: unknown;
  try {
    result = await deps.execute(command, request.data, interaction);
  } catch {
    emit(deps, command, { status: "refused", reason: "execution-unavailable" });
    return;
  }
  const parsed = ResultSchema.safeParse(result);
  emit(deps, command, parsed.success ? parsed.data : { status: "refused", reason: "invalid-service-result" });
}

function emit(deps: DeliveryExecutionHandlerDependencies, command: DeliveryExecutionCommand, result: DeliveryExecutionResult): void {
  deps.write(`${JSON.stringify({ schemaVersion: 1, command: executionPath(command), ...result })}\n`);
  if (result.status === "refused" || result.status === "blocked") deps.setExitCode(1);
}

async function executeDeliveryCommand(
  command: DeliveryExecutionCommand,
  request: unknown,
  interaction?: InteractionContext,
): Promise<unknown> {
  const cwd = requireArcProjectRoot();
  if (cwd === null) return { status: "refused", reason: "arc-project-root-unresolved" };
  const exec = createGitExec(interaction?.subprocess);
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const stateStore = new RepositoryDeliveryStateStore(publisher);
  const eligibilityDeps = {
    observeRef: (ref: string) => observeDeliveryEligibilityRef(exec, ref),
    readAncestry: (ancestor: string, descendant: string) => readAncestry(exec, ancestor, descendant),
    revalidateLifecycleContribution: (input: { protectedBaseRef: string; candidateRef: string; paths: readonly string[] }) => (
      revalidateDeliveryLifecycleContribution({ exec, ...input })
    ),
    compareNormalizedCompleteness: async (input: z.infer<typeof EligibilitySnapshotSchema> extends never ? never : {
      protectedBase: { ref: string; head: string; tree: string };
      control: { ref: string; head: string; tree: string };
      finalCandidate: { deliverableId: string; ref: string; head: string; tree: string };
      lifecyclePaths: readonly string[];
    }) => {
      const compared = await compareGitNormalizedDeliveryTrees({
        exec,
        protectedBaseTree: input.protectedBase.tree,
        controlTree: input.control.tree,
        finalCandidateTree: input.finalCandidate.tree,
        lifecyclePaths: input.lifecyclePaths,
      });
      if (compared.status === "unavailable") return { status: "refused" as const, reason: "unavailable" as const };
      if (compared.status === "match") return compared;
      const reason = compared.droppedPaths.length > 0 ? "dropped" as const
        : compared.inventedPaths.length > 0 ? "invented" as const : "mismatched" as const;
      return { status: "refused" as const, reason };
    },
    readCurrentPlan: async (planId: string) => {
      const read = await planStore.readCurrent(planId);
      return read.status === "ok" ? read.value : null;
    },
    resolveMember: (head: string) => stateStore.resolveMember({ selector: { kind: "head", objectId: head } }),
    inspectCheckout: async (path: string) => (await inspectDeliveryCandidateCheckout(exec, path))
      ?? { head: "", tree: "", trackedDirty: true },
  };
  const observePosition = async (
    plan: z.infer<typeof DeliveryPlanV1Schema>,
    current: { readonly revision: number; readonly value: z.infer<typeof DeliveryStateV1Schema> },
    repository: string,
    remote: string,
  ) => {
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const refs = new Set<string>();
    for (const member of current.value.members) if (member.ref !== null) refs.add(member.ref);
    const operation = current.value.activeOperation;
    for (const member of [...(operation?.before.members ?? []), ...(operation?.requested.members ?? [])]) {
      if (member.ref !== null) refs.add(member.ref);
    }
    const remoteHeads: Record<string, string> = {};
    const localCommits: Record<string, boolean> = {};
    for (const ref of refs) {
      const observed = await observeDeliveryRemoteRef(exec, remote, ref);
      if (observed.status !== "observed") continue;
      const branch = ref.replace(/^refs\/heads\//u, "");
      remoteHeads[branch] = observed.head;
      try {
        await exec("git", ["fetch", "--no-write-fetch-head", remote, observed.head]);
        localCommits[observed.head] = true;
      } catch {
        localCommits[observed.head] = false;
      }
    }
    const observed = await observeRepositoryDeliveryPosition(plan, current.value, current.revision, {
      exec, cwd, host, repository, remoteHeads, localCommits,
    });
    if (observed.status !== "observed") return observed;
    for (const deliverableId of operation?.affectedDeliverableIds ?? []) {
      const index = observed.facts.members.findIndex((member) => member.deliverableId === deliverableId);
      const member = observed.facts.members[index];
      if (member === undefined || member.coordinates === null) continue;
      const predecessor = index === 0
        ? observed.facts.target?.coordinates?.head
        : observed.facts.members[index - 1]?.coordinates?.head ?? observed.facts.target?.coordinates?.head;
      if (predecessor === undefined || member.coordinates.base !== predecessor) return { status: "refused" as const };
    }
    return observed;
  };

  if (command === "native-observe" || command === "native-link" || command === "native-unlink") {
    const host = new GhDeliveryHostPort(hostedGhRunner);
    return command === "native-observe"
      ? observeDeliveryNativeStack(NativeObserveSchema.parse(request), host)
      : command === "native-link"
        ? linkDeliveryNativeStack(NativeLinkSchema.parse(request), host)
        : degradeNativeDeliveryStack(NativeObserveSchema.parse(request), host);
  }
  if (command === "native-land-select") {
    const parsed = NativeSelectSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "blocked", reason: "delivery-unavailable", recommendedActionText: "Restore canonical delivery state before selecting a landing arm." };
    }
    const position = deriveDeliveryPosition(planRead.value, stateRead.value.value, parsed.facts);
    if (position.status !== "derived") {
      return { status: "blocked", reason: position.reason, recommendedActionText: "Refresh exact delivery position before selecting a landing arm." };
    }
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const observation = await observeDeliveryNativeStack({ repository: parsed.repository, members: parsed.members }, host);
    if (observation.status === "refused") {
      return { status: "blocked", reason: observation.reason, recommendedActionText: "Repair the exact native-stack input before selecting a landing arm." };
    }
    return selectNativeDeliveryLandingArm({
      plan: planRead.value,
      landedPrefix: position.position.landedPrefix,
      observation,
      mergeStrategy: parsed.mergeStrategy,
      mergeAction: parsed.mergeAction,
      explicitAtomic: parsed.explicitAtomic,
      members: parsed.members.map(({ deliverableId, changeRequestId, headSha }) => ({ deliverableId, changeRequestId, headSha })),
    });
  }
  if (command === "native-land-prepare" || command === "native-land-submit" || command === "native-land-status") {
    const parsed = (command === "native-land-prepare" ? NativePrepareSchema
      : command === "native-land-submit" ? NativeSubmitSchema : NativeStatusSchema).parse(request);
    const [planRead, stateRead] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "blocked", reason: "delivery-unavailable", recommendedActionText: "Restore canonical delivery state before continuing." };
    }
    const plan = planRead.value;
    const current = stateRead.value;
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const observeNativeEffect = async (
      repository: string,
      operation: Extract<NonNullable<typeof current.value.activeOperation>, { kind: "land" }>,
    ) => {
      const target = await host.observeTarget(repository, operation.effect.targetRef);
      if (target.status !== "observed") return { outcome: "ambiguous" as const };
      const merged: string[] = [];
      for (const entry of operation.before.members) {
        const member = current.value.members.find((candidate) => candidate.deliverableId === entry.deliverableId);
        if (member?.changeRequest === null || member?.changeRequest === undefined || member.coordinates === null) {
          return { outcome: "ambiguous" as const };
        }
        const observed = await host.readRequest(repository, member.changeRequest);
        if (observed.status === "observed" && observed.request.state === "merged") merged.push(member.deliverableId);
      }
      if (merged.length === 0) return { outcome: "none-landed" as const };
      if (merged.length !== operation.before.members.length) {
        return { outcome: "partial-landed" as const, affectedDeliverableIds: merged };
      }
      return { outcome: "all-landed" as const, snapshot: {
        target: { ref: operation.effect.targetRef, coordinates: target.coordinates },
        members: operation.before.members.map((entry) => ({
          ...entry,
          coordinates: {
            base: entry.coordinates?.base ?? target.coordinates.head,
            head: target.coordinates.head,
            tree: target.coordinates.tree,
          },
        })),
      } };
    };
    if (command === "native-land-prepare") {
      const prepare = NativePrepareSchema.parse(parsed);
      return reserveNativeDeliveryLanding({
        plan, current, operationId: prepare.operationId, facts: prepare.facts,
        selection: prepare.selection, repository: prepare.repository, baseRef: prepare.baseRef,
        targetRef: prepare.targetRef,
      }, {
        readiness: async (member) => {
          const bound = current.value.members.find((candidate) => candidate.deliverableId === member.deliverableId);
          if (bound?.ref === null || bound?.ref === undefined || bound.coordinates === null || bound.changeRequest === null) {
            return { status: "refused" as const };
          }
          const observed = await host.readRequest(prepare.repository, bound.changeRequest);
          if (observed.status !== "observed" || observed.request.state !== "open"
            || observed.request.repository !== prepare.repository || observed.request.headRepository !== prepare.repository
            || observed.request.headRef !== bound.ref.replace(/^refs\/heads\//u, "")
            || observed.request.headSha !== bound.coordinates.head
            || observed.request.baseRef !== prepare.baseRef.replace(/^refs\/heads\//u, "")) {
            return { status: "refused" as const };
          }
          const checked = await evaluateReviewReadiness({
            schemaVersion: 1, treeRoot: prepare.treeRoot,
            target: { repository: prepare.repository, pullRequest: Number(member.changeRequestId), headSha: member.headSha },
            pullRequest: { repository: prepare.repository, number: Number(member.changeRequestId), state: "open", headBranch: "delivery", headSha: member.headSha },
            vehicle: { kind: "delivery-member", planId: plan.planId, deliverableId: member.deliverableId, workUnitSlug: plan.workUnitId },
          }, { deliveryMemberLookup: new RepositoryDeliveryMemberLookup({ exec, cwd }) });
          return { status: checked.state === "ready" ? "ready" as const : "refused" as const };
        }, stateStore,
      });
    }
    if (command === "native-land-submit") {
      const submit = NativeSubmitSchema.parse(parsed);
      const operation = current.value.activeOperation;
      return submitReservedNativeDeliveryMerge({
        planId: submit.planId, current, operationId: submit.operationId, request: submit.request,
      }, {
        host, stateStore,
        reobserveSelection: async () => {
          if (operation?.kind !== "land") return { status: "refused" as const };
          const expectedMembers = [];
          for (const [index, entry] of operation.before.members.entries()) {
            const member = current.value.members.find((candidate) => candidate.deliverableId === entry.deliverableId);
            const previous = index === 0 ? null : operation.before.members[index - 1];
            if (member?.ref === null || member?.ref === undefined || member.coordinates === null || member.changeRequest === null) {
              return { status: "refused" as const };
            }
            expectedMembers.push({
              deliverableId: member.deliverableId,
              changeRequestId: member.changeRequest.changeRequestId,
              headRef: member.ref.replace(/^refs\/heads\//u, ""),
              headSha: member.coordinates.head,
              baseRef: previous?.ref?.replace(/^refs\/heads\//u, "") ?? operation.effect.baseRef,
              headRepository: submit.request.repository,
            });
          }
          const observation = await observeDeliveryNativeStack({ repository: submit.request.repository, members: expectedMembers }, host);
          return { status: observation.status === "registered" ? "exact" as const : "refused" as const };
        },
        revalidate: async (deliverableId, headSha) => {
          const member = current.value.members.find((candidate) => candidate.deliverableId === deliverableId);
          if (member?.changeRequest === null || member?.changeRequest === undefined) return { status: "refused" as const };
          const observed = await host.readRequest(submit.request.repository, member.changeRequest);
          if (observed.status !== "observed" || observed.request.state !== "open"
            || observed.request.repository !== submit.request.repository
            || observed.request.headRepository !== submit.request.repository
            || observed.request.headRef !== member.ref?.replace(/^refs\/heads\//u, "")
            || observed.request.headSha !== headSha) return { status: "refused" as const };
          const checked = await evaluateReviewReadiness({
            schemaVersion: 1, treeRoot: submit.treeRoot,
            target: { repository: submit.request.repository, pullRequest: Number(member.changeRequest.changeRequestId), headSha },
            pullRequest: { repository: submit.request.repository, number: Number(member.changeRequest.changeRequestId), state: "open", headBranch: member.ref, headSha },
            vehicle: { kind: "delivery-member", planId: plan.planId, deliverableId, workUnitSlug: plan.workUnitId },
          }, { deliveryMemberLookup: new RepositoryDeliveryMemberLookup({ exec, cwd }) });
          return { status: checked.state === "ready" ? "ready" as const : "refused" as const };
        },
        releaseLock: async (deliverableId) => {
          const member = current.value.members.find((candidate) => candidate.deliverableId === deliverableId);
          const changeRequestId = Number(member?.changeRequest?.changeRequestId);
          if (!Number.isSafeInteger(changeRequestId) || changeRequestId <= 0) return { status: "refused" as const };
          const released = await releaseMergeLock({
            schemaVersion: 1, treeRoot: submit.treeRoot,
            target: { repository: submit.request.repository, pullRequest: changeRequestId, headSha: member?.coordinates?.head ?? "" },
            vehicle: { kind: "delivery-member", planId: plan.planId, deliverableId, workUnitSlug: plan.workUnitId },
          }, defaultMergeLockPort(cwd));
          return { status: released.state === "blocked" ? "refused" as const : released.state === "released" ? "released" as const : "not-configured" as const };
        },
        observeEffect: async () => operation?.kind === "land"
          ? observeNativeEffect(submit.request.repository, operation)
          : { outcome: "ambiguous" as const },
      });
    }
    const status = NativeStatusSchema.parse(parsed);
    const operation = current.value.activeOperation;
    if (operation === null || operation.kind !== "land") {
      return { status: "blocked", reason: "effect-identity-missing", recommendedActionText: "Restore the persisted native land reservation before polling." };
    }
    const nativeResult = await reconcileReservedNativeDeliveryMerge({ planId: status.planId, current, request: status.request }, {
      host, stateStore,
      observeEffect: () => observeNativeEffect(status.request.repository, operation),
    });
    if (nativeResult.status !== "applied") return nativeResult;
    const rawExec = createRawGitExec(cwd);
    return reconcileLinkedNativeDeliverySuffix({
      plan,
      before: current,
      landed: nativeResult.state,
      repository: status.request.repository,
      protectedTargetRef: operation.effect.targetRef,
    }, {
      observeRequest: (binding) => host.readRequest(status.request.repository, binding),
      observeRef: async (ref) => {
        const remoteRef = await observeDeliveryRemoteRef(exec, status.remote, ref);
        if (remoteRef.status !== "observed") return null;
        try {
          await exec("git", ["fetch", "--no-write-fetch-head", status.remote, remoteRef.head]);
        } catch {
          return null;
        }
        const observed = await observeDeliveryEligibilityRef(exec, remoteRef.head);
        return observed?.head === remoteRef.head ? observed : null;
      },
      proveContribution: (endpoints) => proveGitDeliveryContribution({ exec: rawExec, ...endpoints }),
      stateStore,
    });
  }

  if (command === "eligibility-prepare") {
    return prepareDeliveryEligibility(PrepareSchema.parse(request), eligibilityDeps);
  }
  if (command === "eligibility-close") {
    return closeDeliveryEligibility(CloseSchema.parse(request).snapshot, eligibilityDeps);
  }
  if (command === "materialize" || command === "publish") {
    const parsed = (command === "publish" ? PublishSchema : MaterializeSchema).parse(request);
    return executeWithFreshDeliveryEligibility(parsed, {
      ...eligibilityDeps,
      resolveLifecyclePaths: async (plan) => {
        const active = await resolveActiveWu({ cwd });
        if (active.status !== "resolved" || active.name !== plan.workUnitId) return null;
        try {
          const paths = await new CurrentDeliveryLifecycleContributionPathSource({
            readDirectory: (path) => readdir(resolve(cwd, path)),
          }).resolve({
            workUnitId: plan.workUnitId,
            activeMetaPath: validateManagedPath(active.path),
          });
          return [...paths.workUnitArtifacts, ...paths.sharedProjections];
        } catch {
          return null;
        }
      },
      mutate: async ({ plan, snapshot }) => {
        const derived = deriveDeliveryMaterialization(plan, snapshot);
        if (derived.status !== "derived") return derived;
        const refs = {
          observe: async (ref: string) => observeDeliveryRemoteRef(exec, parsed.remote, ref),
          publish: async (ref: string, head: string) => {
            const outcome = await publishDeliveryRemoteRef({ exec, remote: parsed.remote, ref, head });
            return outcome.status === "refused" ? { status: "refused" as const } : outcome;
          },
        };
        const current = await stateStore.read(plan.planId);
        if (current.status !== "ok") return { status: "refused" as const, reason: "state-unavailable" };
        if (current.value === null) {
          if (command === "publish") {
            const publish = PublishSchema.parse(parsed);
            const recovered = await bindInitialDeliveryRequest({
              plan,
              materialization: derived.value,
              stateStore,
              host: new GhDeliveryHostPort(hostedGhRunner),
              repository: publish.repository,
              draft: publish.draft,
            });
            if (recovered.status === "refused") {
              return { status: "refused" as const, reason: "initial-request-refused" };
            }
            if (recovered.status === "absent") {
              const bound = await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore, refs });
              if (bound.status !== "bound") return { status: "refused" as const, reason: bound.reason };
            }
          } else {
            const bound = await bindInitialDeliveryRef({ plan, materialization: derived.value, stateStore, refs });
            if (bound.status !== "bound") return { status: "refused" as const, reason: bound.reason };
          }
        }
        const materialized = await materializeBoundDeliveryChain({
          plan, materialization: derived.value, stateStore, refs,
        });
        if (materialized.status !== "materialized" || command === "materialize") return materialized;
        const publish = PublishSchema.parse(parsed);
        return publishDeliveryRequests({
          plan,
          materialization: derived.value,
          stateStore,
          host: new GhDeliveryHostPort(hostedGhRunner),
          repository: publish.repository,
          draft: publish.draft,
          presentation: (member) => ({ title: member.chunkKey, body: `Delivery member ${member.deliverableId}.` }),
        });
      },
    });
  }
  if (command === "position") {
    const parsed = PositionSchema.parse(request);
    const [plan, state] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (plan.status !== "ok" || plan.value === null || state.status !== "ok" || state.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const position = deriveDeliveryPosition(plan.value, state.value.value, parsed.facts);
    return position.status === "derived"
      ? { status: "position", position: position.position, nextAction: position.position.firstUnlanded === null ? "terminal-handoff" : "review-member" }
      : { status: "refused", reason: position.reason };
  }
  if (command === "land-prepare" || command === "land-apply") {
    const parsed = (command === "land-prepare" ? LandPrepareSchema : LandApplySchema).parse(request);
    const planId = parsed.planId;
    const [planRead, stateRead] = await Promise.all([planStore.readCurrent(planId), stateStore.read(planId)]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const plan = planRead.value;
    const host = new GhDeliveryHostPort(hostedGhRunner);
    const treeRoot = parsed.treeRoot;
    const memberLookup = new RepositoryDeliveryMemberLookup({ exec, cwd });
    const readiness = {
      assess: async (input: {
        planId: string; deliverableId: string; workUnitId: string; repository: string;
        changeRequestId: string; head: string;
      }) => {
        const observed = await host.readRequest(input.repository, {
          providerId: "github", changeRequestId: input.changeRequestId,
        });
        const pullRequest = Number(input.changeRequestId);
        if (observed.status !== "observed" || !Number.isSafeInteger(pullRequest) || pullRequest <= 0) {
          return { status: "refused" as const };
        }
        const checked = await evaluateReviewReadiness({
          schemaVersion: 1,
          treeRoot,
          target: { repository: input.repository, pullRequest, headSha: input.head },
          pullRequest: {
            repository: input.repository,
            number: pullRequest,
            state: observed.request.state === "open" ? "open" : "closed",
            headBranch: observed.request.headRef,
            headSha: observed.request.headSha,
          },
          vehicle: {
            kind: "delivery-member",
            planId: input.planId,
            deliverableId: input.deliverableId,
            workUnitSlug: input.workUnitId,
          },
        }, { deliveryMemberLookup: memberLookup });
        return checked.state === "ready"
          ? { status: "ready" as const, settledReviewState: "ready" }
          : { status: "refused" as const };
      },
    };
    if (command === "land-prepare") {
      const prepare = LandPrepareSchema.parse(parsed);
      return prepareDeliveryLanding({
        plan,
        current: stateRead.value,
        facts: prepare.facts,
        selectedDeliverableId: prepare.selectedDeliverableId,
        repository: prepare.repository,
        baseRef: prepare.baseRef,
        targetRef: prepare.targetRef,
        mergeStrategy: prepare.mergeStrategy,
        releaseMergeLock: prepare.releaseMergeLock,
        stateStore,
        host,
        readiness,
      });
    }
    const apply = LandApplySchema.parse(parsed);
    const current = stateRead.value;
    const lock = {
      release: async (input: { repository: string; changeRequestId: string }) => {
        const pullRequest = Number(input.changeRequestId);
        if (!Number.isSafeInteger(pullRequest) || pullRequest <= 0) return { status: "refused" as const };
        const released = await releaseMergeLock({
          schemaVersion: 1,
          treeRoot,
          target: { repository: input.repository, pullRequest, headSha: apply.approved.head },
          vehicle: {
            kind: "delivery-member",
            planId: plan.planId,
            deliverableId: apply.approved.deliverableId,
            workUnitSlug: plan.workUnitId,
          },
        }, defaultMergeLockPort(cwd));
        return released.state === "blocked"
          ? { status: "refused" as const }
          : { status: released.state === "released" ? "released" as const : "not-configured" as const };
      },
    };
    return applyDeliveryLanding({
      plan,
      current,
      approved: apply.approved,
      stateStore,
      host,
      readiness,
      lock,
      observation: {
        observeSelection: async () => {
          const observed = await observePosition(plan, current, apply.approved.repository, apply.remote);
          const member = observed.status === "observed"
            ? observed.facts.members.find((candidate) => candidate.deliverableId === apply.approved.deliverableId)
            : undefined;
          return observed.status === "observed" && member !== undefined
            ? { status: "observed" as const, facts: observed.facts, snapshot: {
              target: observed.facts.target,
              members: [member],
            } }
            : { status: "refused" as const };
        },
        proveLandedContribution: (coordinates) => proveGitDeliveryContribution({
          exec: createRawGitExec(cwd),
          before: { predecessor: coordinates.beforeTarget, member: coordinates.beforeMember },
          after: { predecessor: coordinates.beforeTarget, member: coordinates.afterTarget },
        }),
      },
    });
  }
  if (command === "reconcile") {
    const parsed = ReconcileSchema.parse(request);
    const [plan, state] = await Promise.all([planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId)]);
    if (plan.status !== "ok" || plan.value === null || state.status !== "ok" || state.value === null) {
      return { status: "refused", reason: "state-unavailable" };
    }
    const currentPlan = plan.value;
    const currentState = state.value;
    return reconcileDeliveryExecution({
      planId: parsed.planId,
      current: currentState,
      stateStore,
      observation: {
        observe: async () => {
          const operation = currentState.value.activeOperation;
          if (operation === null) return { status: "refused" as const };
          if (operation.kind === "teardown") {
            const before = operation.before.members[0];
            if (before?.ref === null || before === undefined || before.changeRequest === null) {
              return { status: "refused" as const };
            }
            const [ref, request, position] = await Promise.all([
              observeDeliveryRemoteRef(exec, parsed.remote, before.ref),
              new GhDeliveryHostPort(hostedGhRunner).readRequest(parsed.repository, before.changeRequest),
              observePosition(currentPlan, currentState, parsed.repository, parsed.remote),
            ]);
            const targetRef = operation.before.target?.ref.replace(/^refs\/heads\//u, "") ?? "";
            return ref.status === "absent" && request.status === "observed"
              && request.request.repository === parsed.repository
              && request.request.headRepository === parsed.repository
              && request.request.headRef === before.ref.replace(/^refs\/heads\//u, "")
              && request.request.baseRef === targetRef
              && (request.request.state === "merged" || request.request.state === "closed")
              && position.status === "observed"
              ? { status: "observed" as const, value: operation.requested }
              : { status: "refused" as const };
          }
          if (operation.kind === "land") {
            const beforeMember = operation.before.members[0];
            if (beforeMember === undefined || beforeMember.changeRequest === null
              || beforeMember.coordinates === null) return { status: "refused" as const };
            const host = new GhDeliveryHostPort(hostedGhRunner);
            const request = await host.readRequest(parsed.repository, beforeMember.changeRequest);
            if (request.status !== "observed"
              || request.request.repository !== operation.effect.repository
              || request.request.headRepository !== operation.effect.repository
              || request.request.binding.changeRequestId !== operation.effect.changeRequestId
              || beforeMember.ref === null
              || request.request.headRef !== beforeMember.ref.replace(/^refs\/heads\//u, "")
              || request.request.headSha !== operation.effect.headSha
              || request.request.baseRef !== operation.effect.baseRef) return { status: "refused" as const };
            if (request.request.state === "open") {
              const before = await observePosition(currentPlan, currentState, parsed.repository, parsed.remote);
              return before.status === "observed"
                && typeof before.operationObservation === "object"
                && before.operationObservation !== null
                && (before.operationObservation as { outcome?: unknown }).outcome === "not-applied"
                ? { status: "observed" as const, value: { outcome: "not-applied" } }
                : { status: "refused" as const };
            }
            if (request.request.state !== "merged") return { status: "refused" as const };
            const target = await host.observeTarget(parsed.repository, operation.effect.targetRef);
            const beforeTarget = operation.before.target?.coordinates;
            if (target.status !== "observed" || beforeTarget === null || beforeTarget === undefined) {
              return { status: "refused" as const };
            }
            try {
              await exec("git", ["fetch", "--no-write-fetch-head", parsed.remote, target.coordinates.head]);
            } catch {
              return { status: "refused" as const };
            }
            const proof = await proveGitDeliveryContribution({
              exec: createRawGitExec(cwd),
              before: { predecessor: beforeTarget, member: beforeMember.coordinates },
              after: { predecessor: beforeTarget, member: target.coordinates },
            });
            if (proof.status !== "accepted") return { status: "refused" as const };
            return {
              status: "observed" as const,
              value: {
                outcome: "applied",
                observation: {
                  kind: "land",
                  effect: operation.effect,
                  outcome: "applied",
                  snapshot: {
                    target: { ref: operation.effect.targetRef, coordinates: target.coordinates },
                    members: operation.before.members.map((member) => ({
                      ...member,
                      coordinates: member.coordinates === null ? null : {
                        base: member.coordinates.base,
                        head: target.coordinates.head,
                        tree: target.coordinates.tree,
                      },
                    })),
                  },
                },
              },
            };
          }
          const observed = await observePosition(currentPlan, currentState, parsed.repository, parsed.remote);
          if (observed.status !== "observed" || observed.operationObservation === null) {
            return { status: "refused" as const };
          }
          return { status: "observed" as const, value: observed.operationObservation };
        },
      },
    });
  }
  if (command === "rematerialize") {
    const parsed = RematerializeSchema.parse(request);
    let latestSnapshot: DeliveryEligibilitySnapshot | null = null;
    return executeFreshDeliverySuffixRematerialization({
      selectedDeliverableIds: parsed.selectedDeliverableIds,
    }, {
      reobserve: async () => {
        const [planRead, stateRead] = await Promise.all([
          planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId),
        ]);
        if (planRead.status !== "ok" || planRead.value === null
          || stateRead.status !== "ok" || stateRead.value === null
          || stateRead.value.value.activeOperation !== null) return { status: "refused" as const };
        const position = await observePosition(planRead.value, stateRead.value, parsed.repository, parsed.remote);
        if (position.status !== "observed") return { status: "refused" as const };
        const landedCount = position.facts.landedDeliverableIds.length;
        const eligible = await executeWithFreshDeliveryEligibility({
          planId: parsed.planId,
          protectedBaseRef: parsed.protectedBaseRef,
          controlRef: parsed.controlRef,
          memberOffset: landedCount,
          candidates: parsed.candidates,
        }, {
          ...eligibilityDeps,
          resolveLifecyclePaths: async (plan) => {
            const active = await resolveActiveWu({ cwd });
            if (active.status !== "resolved" || active.name !== plan.workUnitId) return null;
            try {
              const paths = await new CurrentDeliveryLifecycleContributionPathSource({
                readDirectory: (path) => readdir(resolve(cwd, path)),
              }).resolve({ workUnitId: plan.workUnitId, activeMetaPath: validateManagedPath(active.path) });
              return [...paths.workUnitArtifacts, ...paths.sharedProjections];
            } catch {
              return null;
            }
          },
          mutate: ({ plan, snapshot }) => Promise.resolve({ status: "observed" as const, plan, snapshot }),
        });
        if (eligible.status !== "observed") return { status: "refused" as const };
        const current = await stateStore.read(parsed.planId);
        if (current.status !== "ok" || current.value === null
          || current.value.revision !== stateRead.value.revision) return { status: "refused" as const };
        latestSnapshot = eligible.snapshot;
        return {
          status: "observed" as const,
          plan: eligible.plan,
          current: current.value,
          facts: position.facts,
          snapshot: eligible.snapshot,
        };
      },
      reobserveCandidate: async (rewrite) => {
        const candidate = parsed.candidates.find((entry) => entry.deliverableId === rewrite.deliverableId);
        const expected = rewrite.requested.members[0]?.coordinates;
        const observed = candidate === undefined ? null : await observeDeliveryEligibilityRef(exec, candidate.ref);
        return expected !== null && expected !== undefined && observed !== null
          && observed.head === expected.head && observed.tree === expected.tree;
      },
      proveCarried: (endpoints) => proveGitDeliveryContribution({ exec: createRawGitExec(cwd), ...endpoints }),
      apply: async ({ plan, current, rewrite }) => {
        const member = current.value.members.find((entry) => entry.deliverableId === rewrite.deliverableId);
        const requested = rewrite.requested.members[0];
        const snapshot = latestSnapshot;
        if (member?.ref === null || member?.coordinates === null || member === undefined
          || requested?.coordinates === null || requested === undefined || snapshot === null) {
          return { status: "refused" as const };
        }
        const memberRef = member.ref;
        const memberCoordinates = member.coordinates;
        const requestedCoordinates = requested.coordinates;
        const predecessor = current.value.members[current.value.members.indexOf(member) - 1]?.coordinates
          ?? current.value.target?.coordinates;
        const snapshotIndex = snapshot.members.findIndex((entry) => entry.deliverableId === rewrite.deliverableId);
        const afterPredecessor = snapshotIndex === 0 ? snapshot.protectedBase : snapshot.members[snapshotIndex - 1];
        if (predecessor === null || predecessor === undefined || afterPredecessor === undefined) {
          return { status: "refused" as const };
        }
        const result = await executeDeliverySuffixRewrite({
          plan,
          current,
          deliverableId: rewrite.deliverableId,
          requested: rewrite.requested,
          contributionMode: rewrite.selectedChange ? "selected-change" : "prove-equivalent",
          revalidateLifecycle: async () => {
            const candidate = parsed.candidates.find((entry) => entry.deliverableId === rewrite.deliverableId);
            if (candidate === undefined) return { status: "refused" as const };
            const checked = await revalidateDeliveryLifecycleContribution({
              exec,
              protectedBaseRef: parsed.protectedBaseRef,
              candidateRef: candidate.ref,
              paths: snapshot.lifecyclePaths,
            });
            return { status: checked.status };
          },
          rewriteRef: (effect) => rewriteDeliveryRemoteRef({ exec, remote: parsed.remote, ...effect }),
          observeResult: async () => {
            const observed = await observeDeliveryRemoteRef(exec, parsed.remote, memberRef);
            return observed.status === "observed" && observed.head === requestedCoordinates.head
              ? rewrite.requested
              : { target: null, members: [] };
          },
          proveContribution: () => proveGitDeliveryContribution({
            exec: createRawGitExec(cwd),
            before: { predecessor, member: memberCoordinates },
            after: { predecessor: afterPredecessor, member: requestedCoordinates },
          }),
          stateStore,
        });
        return result.status === "applied" ? result : { status: "refused" as const };
      },
    });
  }
  if (command === "rewrite") {
    const parsed = RewriteSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
    const rawExec = createRawGitExec(cwd);
    return executeDeliverySuffixRewrite({
      plan: planRead.value,
      current: stateRead.value,
      deliverableId: parsed.deliverableId,
      requested: parsed.requested,
      contributionMode: parsed.contributionMode,
      revalidateLifecycle: async () => {
        const checked = await revalidateDeliveryLifecycleContribution({
          exec,
          protectedBaseRef: parsed.protectedBaseRef,
          candidateRef: parsed.candidateRef,
          paths: parsed.lifecyclePaths,
        });
        return { status: checked.status };
      },
      rewriteRef: (input) => rewriteDeliveryRemoteRef({ exec, remote: parsed.remote, ...input }),
      observeResult: async () => {
        const member = parsed.requested.members[0];
        const observed = await observeDeliveryEligibilityRef(exec, parsed.candidateRef);
        return member?.coordinates !== null && member !== undefined && observed !== null
          && observed.head === member.coordinates.head && observed.tree === member.coordinates.tree
          ? parsed.requested
          : { target: null, members: [] };
      },
      proveContribution: () => proveGitDeliveryContribution({ exec: rawExec, ...parsed.contribution }),
      stateStore,
    });
  }
  const parsed = TeardownSchema.parse(request);
    const [planRead, stateRead] = await Promise.all([
      planStore.readCurrent(parsed.planId), stateStore.read(parsed.planId),
    ]);
    if (planRead.status !== "ok" || planRead.value === null || stateRead.status !== "ok" || stateRead.value === null) {
      return { status: "refused", reason: "delivery-unavailable" };
    }
  return teardownLandedDeliveryMember({
      plan: planRead.value,
      current: stateRead.value,
      facts: parsed.facts,
      deliverableId: parsed.deliverableId,
      repository: parsed.repository,
      protectedTargetRef: parsed.protectedTargetRef,
      host: new GhDeliveryHostPort(hostedGhRunner),
      deleteRef: (input) => deleteDeliveryRemoteRef({ exec, remote: parsed.remote, ...input }),
      stateStore,
  });
}
