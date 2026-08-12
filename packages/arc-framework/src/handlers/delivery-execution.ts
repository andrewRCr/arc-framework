/** Strict CLI composition for delivery execution services. */

import { readFile } from "node:fs/promises";

import { z } from "zod";

import {
  declareCliOperandSite,
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { closeDeliveryEligibility, prepareDeliveryEligibility } from "../lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../lib/delivery/git-eligibility.js";
import { revalidateDeliveryLifecycleContribution } from "../lib/delivery/git-lifecycle-contribution.js";
import { proveGitDeliveryContribution } from "../lib/delivery/git-contribution-proof.js";
import {
  deleteDeliveryRemoteRef,
  publishDeliveryRemoteRef,
  rewriteDeliveryRemoteRef,
} from "../lib/delivery/git-materialization.js";
import {
  bindInitialDeliveryRef,
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
import { executeDeliverySuffixRewrite } from "../lib/delivery/suffix-reconciliation.js";
import { teardownLandedDeliveryMember } from "../lib/delivery/teardown.js";
import { linkDeliveryNativeStack, observeDeliveryNativeStack } from "../lib/delivery/native-stack.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
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
const MaterializeSchema = z.strictObject({
  plan: DeliveryPlanV1Schema,
  snapshot: EligibilitySnapshotSchema,
  remote: z.string().min(1).default("origin"),
});
const PublishSchema = MaterializeSchema.extend({
  repository: z.string().min(1),
  draft: z.boolean(),
});
const PositionSchema = z.strictObject({ planId: DeliveryPlanIdSchema, facts: z.unknown() });
const ReconcileSchema = z.strictObject({ planId: DeliveryPlanIdSchema, observation: z.unknown() });
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
  facts: DeliveryPositionFactsV1Schema,
  approved: PreparedLandingSchema,
  baseRef: RefSchema,
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

const RequestSchemas = {
  "eligibility-prepare": PrepareSchema,
  "eligibility-close": CloseSchema,
  materialize: MaterializeSchema,
  publish: PublishSchema,
  position: PositionSchema,
  "land-prepare": LandPrepareSchema,
  "land-apply": LandApplySchema,
  reconcile: ReconcileSchema,
  rewrite: RewriteSchema,
  teardown: TeardownSchema,
  "native-observe": NativeObserveSchema,
  "native-link": NativeLinkSchema,
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
  z.strictObject({ status: z.literal("retryable"), guidance: z.string().min(1) }),
  z.strictObject({ status: z.literal("blocked"), guidance: z.string().min(1) }),
  z.strictObject({ status: z.literal("blocked"), reason: z.string().min(1), reservation: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("torn-down"), state: z.strictObject({ revision: z.number().int().positive(), value: DeliveryStateV1Schema }) }),
  z.strictObject({ status: z.literal("registered"), stackNumber: z.number().int().positive() }),
  z.strictObject({ status: z.literal("unregistered") }),
  z.strictObject({ status: z.enum(["partial", "incoherent"]), affectedDeliverableIds: z.array(DeliveryCanonicalDigestSchema) }),
  z.strictObject({ status: z.enum(["unsupported", "unavailable", "malformed", "ambiguous"]) }),
  z.strictObject({ status: z.literal("linked"), stackNumber: z.number().int().positive(), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("unlinked"), recommendedActionText: z.string().min(1) }),
  z.strictObject({ status: z.literal("downgrade-required"), reason: z.string().min(1), recommendedActionText: z.string().min(1) }),
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

  if (command === "native-observe" || command === "native-link") {
    const host = new GhDeliveryHostPort(hostedGhRunner);
    return command === "native-observe"
      ? observeDeliveryNativeStack(NativeObserveSchema.parse(request), host)
      : linkDeliveryNativeStack(NativeLinkSchema.parse(request), host);
  }

  if (command === "eligibility-prepare") {
    return prepareDeliveryEligibility(PrepareSchema.parse(request), eligibilityDeps);
  }
  if (command === "eligibility-close") {
    return closeDeliveryEligibility(CloseSchema.parse(request).snapshot, eligibilityDeps);
  }
  if (command === "materialize" || command === "publish") {
    const parsed = (command === "publish" ? PublishSchema : MaterializeSchema).parse(request);
    const derived = deriveDeliveryMaterialization(parsed.plan, parsed.snapshot);
    if (derived.status !== "derived") return derived;
    const refs = {
      publish: async (ref: string, head: string) => {
        const outcome = await publishDeliveryRemoteRef({ exec, remote: parsed.remote, ref, head });
        return outcome.status === "refused" ? { status: "refused" as const } : outcome;
      },
    };
    const current = await stateStore.read(parsed.plan.planId);
    if (current.status !== "ok") return { status: "refused", reason: "state-unavailable" };
    if (current.value === null) {
      const bound = await bindInitialDeliveryRef({ plan: parsed.plan, materialization: derived.value, stateStore, refs });
      if (bound.status !== "bound") return { status: "refused", reason: bound.reason };
    }
    const materialized = await materializeBoundDeliveryChain({
      plan: parsed.plan, materialization: derived.value, stateStore, refs,
    });
    if (materialized.status !== "materialized" || command === "materialize") return materialized;
    const publish = PublishSchema.parse(parsed);
    return publishDeliveryRequests({
      plan: publish.plan,
      materialization: derived.value,
      stateStore,
      host: new GhDeliveryHostPort(hostedGhRunner),
      repository: publish.repository,
      draft: publish.draft,
      presentation: (member) => ({ title: member.chunkKey, body: `Delivery member ${member.deliverableId}.` }),
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
      current: stateRead.value,
      facts: apply.facts,
      approved: apply.approved,
      baseRef: apply.baseRef,
      stateStore,
      host,
      readiness,
      lock,
    });
  }
  if (command === "reconcile") {
    const parsed = ReconcileSchema.parse(request);
    const state = await stateStore.read(parsed.planId);
    if (state.status !== "ok" || state.value === null) return { status: "refused", reason: "state-unavailable" };
    return reconcileDeliveryExecution({ planId: parsed.planId, current: state.value, observation: parsed.observation, stateStore });
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
