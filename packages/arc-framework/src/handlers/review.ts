/** Machine-readable review workflow handlers. */

import { readFile } from "node:fs/promises";
import { z, ZodError, type ZodType } from "zod";

import {
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  createGitExec,
  createRawGitExec,
  gitExec,
} from "../lib/io-context.js";
import {
  classifyPlanningLane,
  resolveChangeSet,
} from "../lib/change-facts.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../lib/delivery/plan.js";
import { RepositoryGitCommonStatePublisher } from "../lib/git-common-state.js";
import { canonicalize } from "../lib/kernel/index.js";
import { SlugSchema } from "../lib/kernel/schema/slug.js";
import { resolveArcRoot } from "../lib/paths.js";
import { resolveUserIdentity } from "./shared.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";
import type { SpineRemedy } from "../scripts/integration/spine-refusal.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";
import {
  FrontlineResolveEnvelopeSchema,
  FrontlineRunEnvelopeSchema,
  ReviewChunkingResolveEnvelopeSchema,
  LocalAttestEnvelopeSchema,
  LocalPrepareEnvelopeSchema,
  LocalResumeEnvelopeSchema,
  ReduceEnvelopeSchema,
  RespondEnvelopeSchema,
  ReviewCommandErrorEnvelopeSchema,
  prePublicationRemedy,
  prePublicationTargetRemedy,
  type ReviewCommandErrorCode,
  type ReviewCommandMode,
  type ReviewPrePublicationRefusalCode,
} from "../scripts/review-gate/core/review-command-envelope.js";
import { ReviewChunkingResolveRequestSchema } from "../scripts/review-gate/core/review-chunking-command-schema.js";
import { DeliveryBindingLookup } from "../scripts/review-gate/core/delivery-binding-lookup.js";
import {
  createLocalFrontlineSourcePreferenceReader,
} from "../scripts/review-gate/hosts/local/frontline-source-preferences.js";
import { resolveConfiguredLanePolicy } from "../scripts/review-gate/policy/lane-policy-config.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../scripts/review-gate/policy/standard-review.js";
import {
  createPrePublicationCompositionDependencies,
} from "../scripts/review-gate/policy/pre-publication-composition.js";
import {
  applyCarriedOwnerAcceptedTerminus,
  applyCarriedStandardReviewReservation,
  consumeOwnerAcceptedTerminus,
  composePrePublicationReviewRequest,
  type PrePublicationComposition,
} from "../scripts/review-gate/policy/pre-publication-request.js";
import {
  PrePublicationReviewEnvelopeSchema,
  prePublicationBoundary,
  projectPrePublicationReview,
  type PrePublicationReviewEnvelope,
} from "../scripts/review-gate/policy/pre-publication-procedure.js";
import {
  parseIntegrationBoundaryLocus,
  type IntegrationBoundaryLocus,
} from "../scripts/review-gate/policy/integration-boundary-locus.js";
import {
  readSubmissionBoundaryVersioned,
  writeSubmissionBoundary,
} from "../lib/work-unit/submission-boundary-store.js";
import { createReviewRequirement } from "../scripts/review-gate/core/gate-contract-v2.js";
import {
  bindReviewSourceReference,
  parseReviewSourceReference,
} from "../scripts/review-gate/core/review-source-reference.js";
import {
  LocalTargetDerivationError,
  type LocalTargetInvalidReason,
} from "../scripts/review-gate/hosts/local/repository-target.js";
import {
  FrontlineCommandRequestSchema,
  resolveFrontlineCommand,
} from "../scripts/review-gate/policy/frontline-command.js";
import {
  ReviewPolicyCommandRequestSchema,
  ReviewResolveEnvelopeSchema,
  resolveReviewPolicy,
  type ReviewPolicyCommandRequest,
} from "../scripts/review-gate/policy/review-policy-driver.js";
import {
  evaluateReviewReadiness,
  ReviewReadinessEnvelopeSchema,
  ReviewReadinessRequestSchema,
  type ReviewReadinessEnvelope,
  type ReviewReadinessRequest,
} from "../scripts/review-gate/readiness.js";
import {
  MergeLockCommandErrorEnvelopeSchema,
  MergeLockHoldEnvelopeSchema,
  MergeLockReleaseEnvelopeSchema,
  MergeLockResolveEnvelopeSchema,
  type MergeLockCommandMode,
} from "../scripts/review-gate/merge-lock-command-envelope.js";
import {
  MergeLockResolveRequestSchema,
  MergeLockTransitionRequestSchema,
  holdMergeLock,
  releaseMergeLock,
  resolveMergeLock,
  type MergeLockPort,
  type MergeLockResolveRequest,
  type MergeLockTransitionRequest,
} from "../scripts/review-gate/merge-lock.js";
import { GhMergeLockPort } from "../scripts/review-gate/hosts/github/merge-lock.js";
import { RepositoryDeliveryMemberLookup } from "../scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { resolveAcceptableDeliveryBaseRefs } from
  "../scripts/review-gate/core/delivery-member-lookup.js";
import { resolveReviewHeadRef } from "../scripts/review-gate/core/review-subject.js";
import { readMergeLockSetting } from "../scripts/review-gate/hosts/local/merge-lock-config.js";
import { FrontlineSourceRegistry } from "../scripts/review-gate/policy/frontline-source.js";
import { resolveReviewChunkingCommand } from "../scripts/review-gate/policy/review-chunking-command.js";
import { CODERABBIT_FRONTLINE_REGISTRATION } from "../scripts/review-gate/providers/coderabbit/frontline-execution.js";
import {
  HostedRequestEnvelopeSchema,
  HostedRequestResultSchema,
  requestHostedReview,
  HostedErrandProgressBindingSchema,
  type HostedReviewAdapter,
  type HostedErrandProgressBinding,
  type HostedRequestVehicle,
  type HostedProviderId,
  type HostedTarget,
} from "../scripts/review-gate/hosted/request.js";
import {
  HostedAwaitEnvelopeSchema,
  HostedAwaitResultSchema,
  awaitHostedReview,
  type HostedReviewObserver,
} from "../scripts/review-gate/hosted/await.js";
import { resolveHostedAwaitTiming } from "../scripts/review-gate/hosted/await-config.js";
import {
  hostedLaneAttemptId,
  readLaneProgress,
  recordHostedAwaitAttempt,
  recordHostedRequestUnavailableAttempt,
  settleHostedAttemptFinding,
} from "../scripts/review-gate/lane-progress.js";
import {
  assertHostedErrandAdmission,
  assertHostedErrandBindingAuthority,
  assertHostedReservationAdmission,
  configuredSourceSuffix,
} from
  "../scripts/review-gate/policy/hosted-reservation-admission.js";
import { LocalReviewOperationStateStore } from "../scripts/review-gate/hosts/local/operation-state-store.js";
import { resolveRepositoryIdentity } from "../scripts/review-gate/hosts/local/git-common-state.js";
import { LocalApprovedDispositionRecordStore } from "../scripts/review-gate/hosts/local/disposition-record-store.js";
import {
  HostedSettleEnvelopeSchema,
  HostedSettleResultSchema,
  settleHostedFinding,
  type HostedSettlementPort,
} from "../scripts/review-gate/hosted/settle.js";
import {
  GhHostedReviewPort,
  hostedGhRunner,
  type HostedProcessRunner,
} from "../scripts/review-gate/hosted/gh-process.js";
import { CodeRabbitHostedAdapter } from "../scripts/review-gate/hosted/coderabbit.js";
import { CodexHostedAdapter } from "../scripts/review-gate/hosted/codex.js";
import { resolveActiveHostedReviewErrand } from "../scripts/review-gate/hosted/errand-authority.js";
import { createFrontlineRunDependencies } from "../scripts/review-gate/runtime/frontline-run-composition.js";
import {
  FrontlineRunRequestSchema,
  runFrontlineReviewCommand,
} from "../scripts/review-gate/runtime/frontline-run-command.js";
import { createLocalPrepareDependencies } from "../scripts/review-gate/runtime/local-prepare-composition.js";
import {
  LocalPrepareRequestSchema,
  prepareLocalReview,
} from "../scripts/review-gate/runtime/local-prepare.js";
import { createLocalAttestDependencies } from "../scripts/review-gate/runtime/local-attest-composition.js";
import {
  LocalAttestRequestSchema,
  attestLocalReviewCommand,
} from "../scripts/review-gate/runtime/local-attest-command.js";
import { createLocalResumeDependencies } from "../scripts/review-gate/runtime/local-resume-composition.js";
import {
  LocalResumeRequestSchema,
  resumeLocalReviewCommand,
} from "../scripts/review-gate/runtime/local-resume-command.js";
import { createRespondDependencies } from "../scripts/review-gate/runtime/respond-composition.js";
import {
  RespondRequestSchema,
  respondToReviewCommand,
} from "../scripts/review-gate/runtime/respond-command.js";
import { createReduceDependencies } from "../scripts/review-gate/runtime/reduce-composition.js";
import {
  ReduceRequestSchema,
  reduceReviewCommand,
} from "../scripts/review-gate/runtime/reduce-command.js";
import {
  ChangeRequestResolveCliInputSchema,
  ChangeRequestResolveInputSchema,
  ChangeRequestResolveResultSchema,
  resolveChangeRequest,
  type ChangeRequestResolveInput,
  type ChangeRequestResolveResult,
} from "../scripts/review-gate/change-request.js";
import { createGhChangeRequestResolutionPort } from "../scripts/review-gate/hosts/github/change-request.js";
import {
  composeDeliveryMemberTarget,
  deriveLocalReviewTarget,
} from "../scripts/review-gate/hosts/local/repository-target.js";
import {
  MergeMethodSchema,
  MergeMethodStackPositionSchema,
  MergeMethodResolveResultSchema,
  mergeMethodResolveArgv,
  resolveMergeMethod,
  type MergeMethodResolveResult,
  type MergeMethodStackPosition,
} from "../scripts/review-gate/merge-method.js";
import { createGhMergeMethodPolicyPort } from "../scripts/review-gate/hosts/github/merge-method.js";
import {
  ChecksAwaitCommandResultSchema,
  ChecksAwaitInputSchema,
  awaitRequiredChecks,
  type ChecksAwaitResult,
} from "../scripts/review-gate/checks-await.js";
import { createGhRequiredChecksPort } from "../scripts/review-gate/hosts/github/checks-await.js";
import { createReviewStatusPort } from "../scripts/review-gate/status-composition.js";
import { spineRemedy } from "../scripts/integration/spine-refusal.js";
import {
  ReviewStatusCommandResultSchema,
  resolveReviewStatus,
  ReviewStatusTargetInputSchema,
  type ReviewStatusResult,
} from "../scripts/review-gate/status.js";

/**
 * Build the request-source operand schema owned by one review command.
 *
 * Each command registers its own instance: the registry keys schemas by identity,
 * so a shared instance would collide across the family's seven canonical paths.
 *
 * @returns One review command's request-source operand schema
 */
function reviewCommandInputSchema(): z.ZodType<{ input: string }> {
  return z.object({
    input: z.string().trim().min(1, "A JSON request file path, or - for stdin, is required."),
  }).strict();
}

/** Request-source operand schema shared by the review handlers' own validation. */
export const ReviewCommandInputSchema = reviewCommandInputSchema();

/** Canonical paths of the review commands sharing the JSON request-source operand. */
const REVIEW_JSON_COMMAND_PATHS = [
  "review readiness",
  "review resolve",
  "review chunking resolve",
  "review frontline resolve",
  "review frontline run",
  "review hosted request",
  "review hosted await",
  "review hosted settle",
  "review local prepare",
  "review local attest",
  "review local resume",
  "review respond",
  "review reduce",
] as const;

/** Syntax-owned exact-change input for the planning-lane classifier. */
export const ReviewPlanningLaneInputSchema = z.object({
  base: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  head: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
  repository: z.string().trim().min(1).optional(),
}).strict().refine(({ base, head }) => base.length === head.length, {
  message: "base and head object ids must have the same width",
});

const reviewPlanningLaneInputRegistration = {
  commandPath: "review planning-lane",
  schema: ReviewPlanningLaneInputSchema,
  schemaFields: {
    "operand.base": "base",
    "operand.head": "head",
    "option.repository": "repository",
  },
} satisfies CommandInputRegistration;

/** Canonical paths of the merge-lock commands sharing the same JSON request-source operand. */
const MERGE_LOCK_JSON_COMMAND_PATHS = [
  "merge lock resolve",
  "merge lock hold",
  "merge lock release",
] as const;

const reviewChangeRequestInputRegistration: CommandInputRegistration = {
  commandPath: "review change-request resolve",
  schema: ChangeRequestResolveCliInputSchema,
  schemaFields: {
    "option.head-ref": "headRef",
    "option.head-sha": "headSha",
    "option.require-remote": "requireRemote",
  },
};

const reviewChecksAwaitInputRegistration: CommandInputRegistration = {
  commandPath: "review checks await",
  schema: ChecksAwaitInputSchema,
  schemaFields: {
    "option.repository": "repository",
    "option.pull-request": "pullRequest",
    "option.head-sha": "headSha",
    "option.timeout-ms": "timeoutMs",
    "option.poll-interval-ms": "pollIntervalMs",
  },
};

export const ReviewStatusCliInputSchema = z.strictObject({ target: z.string().trim().min(1) });

/** Syntax-owned input for the pre-publication review procedure. */
export const ReviewPrePublicationInputSchema = z.strictObject({
  name: SlugSchema,
  selfReview: z.literal("settled").optional(),
  changeSet: z.string().trim().min(1, "A JSON change-set file path, or - for stdin, is required.")
    .optional(),
  lanes: z.string().trim().min(1, "A JSON lane-judgment file path, or - for stdin, is required.")
    .optional(),
  resume: z.string().regex(/^[A-Za-z0-9_-]+$/u).optional(),
  json: z.literal(true),
}).superRefine((input, context) => {
  if (input.changeSet === "-" && input.lanes === "-") {
    context.addIssue({ code: "custom", message: "Only one of --change-set and --lanes may read stdin." });
  }
  if (input.resume !== undefined
    && (input.selfReview !== undefined || input.changeSet !== undefined || input.lanes !== undefined)) {
    context.addIssue({ code: "custom", path: ["resume"], message: "--resume cannot be combined with judgment options." });
  }
});

const reviewPrePublicationInputRegistration: CommandInputRegistration = {
  commandPath: "review pre-publication",
  schema: ReviewPrePublicationInputSchema,
  schemaFields: {
    "operand.name": "name",
    "option.self-review": "selfReview",
    "option.change-set": "changeSet",
    "option.lanes": "lanes",
    "option.resume": "resume",
    "option.json": "json",
  },
};

const reviewStatusInputRegistration: CommandInputRegistration = {
  commandPath: "review status",
  schema: ReviewStatusCliInputSchema,
  schemaFields: { "option.target": "target" },
};

/** Syntax-owned stack position for merge-method resolution. */
export const ReviewMergeMethodResolveInputSchema = z.strictObject({
  stackPosition: MergeMethodStackPositionSchema.default("non-delivery"),
});

const reviewMergeMethodResolveInputRegistration: CommandInputRegistration = {
  commandPath: "review merge-method resolve",
  schema: ReviewMergeMethodResolveInputSchema,
  schemaFields: { "option.stack-position": "stackPosition" },
};

/** Registry contributions owned by the review and merge-lock command adapters. */
export const reviewCommandInputRegistrations = [
  ...[...REVIEW_JSON_COMMAND_PATHS, ...MERGE_LOCK_JSON_COMMAND_PATHS].map((commandPath) => ({
    commandPath,
    schema: reviewCommandInputSchema(),
    schemaFields: { "operand.input": "input" },
  })),
  reviewPlanningLaneInputRegistration,
  reviewChangeRequestInputRegistration,
  reviewChecksAwaitInputRegistration,
  reviewStatusInputRegistration,
  reviewMergeMethodResolveInputRegistration,
  reviewPrePublicationInputRegistration,
] satisfies readonly CommandInputRegistration[];

export interface ReviewChangeRequestResolveOptions {
  headRef: string;
  headSha: string;
  requireRemote?: boolean;
  json?: boolean;
}

export interface ReviewChangeRequestResolveHandlerDependencies {
  resolve(input: ChangeRequestResolveInput, cwd: string): Promise<ChangeRequestResolveResult>;
  resolveRoot(cwd: string): string | null;
  readBaseRef(cwd: string): Promise<string>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Resolve one exact head's host-anchored change-request disposition. */
export async function handleReviewChangeRequestResolve(
  options: ReviewChangeRequestResolveOptions,
  interaction?: InteractionContext,
  overrides: Partial<ReviewChangeRequestResolveHandlerDependencies> = {},
): Promise<void> {
  const exec = createGitExec(interaction?.subprocess);
  const dependencies: ReviewChangeRequestResolveHandlerDependencies = {
    resolve: async (input, cwd) => resolveChangeRequest({
      ...input,
      acceptableBaseRefs: await resolveAcceptableDeliveryBaseRefs(
        new RepositoryDeliveryMemberLookup({ exec, cwd }),
        input.headSha,
      ),
    }, createGhChangeRequestResolutionPort(exec, cwd)),
    resolveRoot: (cwd) => resolveArcRoot(cwd),
    readBaseRef: async (cwd) => {
      const config = await readConfigSettings(cwd);
      if (config.warnings.length > 0) throw new Error(config.warnings.join("; "));
      return config.settings["branch.base"];
    },
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsed = ChangeRequestResolveCliInputSchema.safeParse({
    headRef: options.headRef,
    headSha: options.headSha,
    ...(options.requireRemote === true ? { requireRemote: true } : {}),
  });
  if (!parsed.success) {
    dependencies.write(`${JSON.stringify(ChangeRequestResolveResultSchema.parse({
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      targetRef: null,
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      detail: parsed.error.issues.map((issue) => issue.message).join("; "),
      remedy: spineRemedy(
        "Change-request resolution requires an exact branch and head.",
        "Review command usage",
        ["arc", "review", "change-request", "resolve", "--help"],
      ),
    }))}\n`);
    dependencies.setExitCode(64);
    return;
  }
  const cwd = dependencies.resolveRoot(process.cwd());
  if (cwd === null) {
    dependencies.write(`${JSON.stringify(ChangeRequestResolveResultSchema.parse({
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      targetRef: null,
      state: "blocked",
      nextAction: "stop",
      reason: "host-failure",
      detail: "Change-request resolution must run inside an ARC project.",
    }))}\n`);
    dependencies.setExitCode(1);
    return;
  }
  let result: ChangeRequestResolveResult;
  try {
    result = await dependencies.resolve(ChangeRequestResolveInputSchema.parse({
      ...parsed.data,
      baseRef: await dependencies.readBaseRef(cwd),
    }), cwd);
  } catch (error) {
    result = ChangeRequestResolveResultSchema.parse({
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      targetRef: null,
      state: "blocked",
      nextAction: "stop",
      reason: "host-failure",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  dependencies.write(`${JSON.stringify(ChangeRequestResolveResultSchema.parse(result))}\n`);
}

export interface ReviewMergeMethodResolveOptions {
  json?: boolean;
  stackPosition?: string;
}

export interface ReviewMergeMethodResolveHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readConfiguredMethod(cwd: string): Promise<"merge" | "rebase" | "squash">;
  resolve(
    method: "merge" | "rebase" | "squash",
    stackPosition: MergeMethodStackPosition,
  ): Promise<MergeMethodResolveResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Validate the configured merge method against live repository policy. */
export async function handleReviewMergeMethodResolve(
  options: ReviewMergeMethodResolveOptions,
  overrides: Partial<ReviewMergeMethodResolveHandlerDependencies> = {},
): Promise<void> {
  const port = createGhMergeMethodPolicyPort(hostedGhRunner);
  const dependencies: ReviewMergeMethodResolveHandlerDependencies = {
    resolveRoot: (cwd) => resolveArcRoot(cwd),
    readConfiguredMethod: async (cwd) => {
      const config = await readConfigSettings(cwd);
      if (config.warnings.length > 0) throw new Error(config.warnings.join("; "));
      return MergeMethodSchema.parse(config.settings["merge.strategy"]);
    },
    resolve: (method, stackPosition) => resolveMergeMethod(method, port, undefined, stackPosition),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsedStackPosition = MergeMethodStackPositionSchema.safeParse(options.stackPosition ?? "non-delivery");
  const stackPosition = parsedStackPosition.success ? parsedStackPosition.data : "non-delivery";
  if (!parsedStackPosition.success) {
    dependencies.write(`${JSON.stringify(MergeMethodResolveResultSchema.parse({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: null,
      stackPosition,
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      configuredMethod: null,
      allowedMethods: [],
      detail: "Stack position must be non-delivery, intermediate, or top.",
      remedy: spineRemedy(
        "Merge-method resolution requires a known stack position.",
        "Review command usage",
        ["arc", "review", "merge-method", "resolve", "--help"],
      ),
    }))}\n`);
    dependencies.setExitCode(1);
    return;
  }
  try {
    const root = dependencies.resolveRoot(process.cwd());
    if (root === null) throw new Error("Merge-method resolution must run inside an ARC project.");
    const configuredMethod = await dependencies.readConfiguredMethod(root);
    dependencies.write(`${JSON.stringify(MergeMethodResolveResultSchema.parse(
      await dependencies.resolve(configuredMethod, stackPosition),
    ))}\n`);
  } catch (error) {
    dependencies.write(`${JSON.stringify(MergeMethodResolveResultSchema.parse({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: null,
      stackPosition,
      state: "blocked",
      nextAction: "stop",
      reason: "policy-unreadable",
      configuredMethod: null,
      allowedMethods: [],
      detail: error instanceof Error ? error.message : String(error),
      remedy: spineRemedy(
        "The configured merge method must come from readable project and repository policy.",
        "Run from the target ARC project after repairing its configuration, then re-run",
        mergeMethodResolveArgv(stackPosition),
      ),
    }))}\n`);
    dependencies.setExitCode(1);
  }
}

export interface ReviewChecksAwaitOptions {
  repository: string;
  pullRequest: string;
  headSha: string;
  timeoutMs: string;
  pollIntervalMs: string;
  json?: boolean;
}

export interface ReviewStatusOptions {
  target: string;
  json?: boolean;
}

export interface ReviewStatusHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  resolve(cwd: string, input: z.infer<typeof ReviewStatusTargetInputSchema>): Promise<ReviewStatusResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Resolve review, check, and base state for one opaque exact-target reference. */
export async function handleReviewStatus(
  options: ReviewStatusOptions,
  interaction?: InteractionContext,
  overrides: Partial<ReviewStatusHandlerDependencies> = {},
): Promise<void> {
  const exec = createGitExec(interaction?.subprocess);
  const dependencies: ReviewStatusHandlerDependencies = {
    resolveRoot: (cwd) => resolveArcRoot(cwd),
    resolve: (root, request) => resolveReviewStatus(request, createReviewStatusPort({ cwd: root, exec })),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  let decoded: unknown;
  try {
    decoded = JSON.parse(options.target) as unknown;
  } catch {
    decoded = null;
  }
  const parsed = ReviewStatusTargetInputSchema.safeParse({ target: decoded });
  if (!parsed.success) {
    const detail = parsed.error.issues.map(({ message }) => message).join("; ");
    dependencies.write(`${JSON.stringify(ReviewStatusCommandResultSchema.parse({
      schemaVersion: 1,
      mode: "review-status",
      target: null,
      requiredChecks: "unavailable",
      routedObligation: { state: "blocked", detail },
      currentBaseOid: null,
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      detail,
      remedy: spineRemedy(
        "Review status requires the exact target emitted by change-request resolution.",
        "Review command usage",
        ["arc", "review", "status", "--help"],
      ),
    }))}\n`);
    dependencies.setExitCode(64);
    return;
  }
  const cwd = dependencies.resolveRoot(process.cwd());
  if (cwd === null) {
    const detail = "Review status must run inside an ARC project.";
    dependencies.write(`${JSON.stringify(ReviewStatusCommandResultSchema.parse({
      schemaVersion: 1,
      mode: "review-status",
      target: parsed.data.target,
      requiredChecks: "unavailable",
      routedObligation: { state: "blocked", detail },
      currentBaseOid: null,
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail,
      remedy: spineRemedy(
        "Review status requires repository-local ARC state.",
        "Change to the target ARC project, then re-run",
        ["arc", "review", "status", "--target", JSON.stringify(parsed.data.target), "--json"],
      ),
    }))}\n`);
    dependencies.setExitCode(1);
    return;
  }
  try {
    dependencies.write(`${JSON.stringify(ReviewStatusCommandResultSchema.parse(
      await dependencies.resolve(cwd, parsed.data),
    ))}\n`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    dependencies.write(`${JSON.stringify(ReviewStatusCommandResultSchema.parse({
      schemaVersion: 1,
      mode: "review-status",
      target: parsed.data.target,
      requiredChecks: "unavailable",
      routedObligation: { state: "blocked", detail },
      currentBaseOid: null,
      state: "blocked",
      nextAction: "stop",
      reason: "status-unavailable",
      detail,
      remedy: spineRemedy(
        "Review status could not read its repository or host evidence.",
        "Resolve the operational failure, then re-run",
        ["arc", "review", "status", "--target", JSON.stringify(parsed.data.target), "--json"],
      ),
    }))}\n`);
    dependencies.setExitCode(1);
  }
}

export interface ReviewChecksAwaitHandlerDependencies {
  awaitChecks(input: z.infer<typeof ChecksAwaitInputSchema>): Promise<ChecksAwaitResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Await required checks on one exact pull-request head. */
export async function handleReviewChecksAwait(
  options: ReviewChecksAwaitOptions,
  overrides: Partial<ReviewChecksAwaitHandlerDependencies> = {},
): Promise<void> {
  const port = createGhRequiredChecksPort(hostedGhRunner);
  const dependencies: ReviewChecksAwaitHandlerDependencies = {
    awaitChecks: (input) => awaitRequiredChecks(input, {
      port,
      clock: { now: () => Date.now(), sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) },
    }),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsed = ChecksAwaitInputSchema.safeParse({
    repository: options.repository,
    pullRequest: Number(options.pullRequest),
    headSha: options.headSha,
    timeoutMs: Number(options.timeoutMs),
    pollIntervalMs: Number(options.pollIntervalMs),
  });
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join("; ");
    dependencies.write(`${JSON.stringify(ChecksAwaitCommandResultSchema.parse({
      schemaVersion: 1,
      mode: "review-checks-await",
      repository: null,
      pullRequest: null,
      headSha: null,
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      detail,
      remedy: spineRemedy(
        "Required-check waiting needs one exact repository, pull request, and head.",
        "Review command usage",
        ["arc", "review", "checks", "await", "--help"],
      ),
    }))}\n`);
    dependencies.setExitCode(64);
    return;
  }
  try {
    dependencies.write(`${JSON.stringify(ChecksAwaitCommandResultSchema.parse(
      await dependencies.awaitChecks(parsed.data),
    ))}\n`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    dependencies.write(`${JSON.stringify(ChecksAwaitCommandResultSchema.parse({
      schemaVersion: 1,
      mode: "review-checks-await",
      repository: parsed.data.repository,
      pullRequest: parsed.data.pullRequest,
      headSha: parsed.data.headSha,
      state: "blocked",
      nextAction: "stop",
      reason: "checks-unavailable",
      detail,
      remedy: spineRemedy(
        "Required-check status must be readable for the exact target.",
        "Resolve the host read failure, then re-run",
        [
          "arc", "review", "checks", "await",
          "--repository", parsed.data.repository,
          "--pull-request", String(parsed.data.pullRequest),
          "--head-sha", parsed.data.headSha,
          "--json",
        ],
      ),
    }))}\n`);
    dependencies.setExitCode(1);
  }
}

/** Input and interaction policies owned by the review command adapters. */
export const reviewCommandInputPolicyDeclarations = [
  {
    commandPath: "review merge-method resolve",
    aliases: [],
    sites: [declareCliOptionSite("stack-position", {
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "stackPosition",
      defaultSource: JSON.stringify("non-delivery"),
      cancellation: "not-applicable",
      automation: {
        noInput: "same",
        flags: ["--stack-position <position>"],
        acceptedSyntax: ["--stack-position <position>"],
      },
      mutationBoundary: "merge-method policy resolution",
      subprocess: "none",
    })],
  },
  {
    commandPath: "review", aliases: [], sites: [
      declareInteractionSite(
        { file: "handlers/review.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
        {
          acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
          automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
          mutationBoundary: "review request read", subprocess: "explicit-stdin",
        },
      ),
      declareInteractionSite(
        { file: "scripts/review-gate/hosted/gh-process.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
        {
          acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
          automation: { noInput: "same", flags: [], acceptedSyntax: [] },
          mutationBoundary: "hosted review GitHub subprocess boundary", subprocess: "close-stdin",
        },
      ),
    ],
  },
  {
    commandPath: "review chunking resolve", aliases: [], sites: [declareInteractionSite(
      { file: "lib/change-facts.ts", kind: "subprocess", callee: "spawn", occurrence: 1 },
      {
        acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "same", flags: [], acceptedSyntax: [] },
        mutationBoundary: "review target diff read", subprocess: "close-stdin",
      },
    )],
  },
  {
    commandPath: "review frontline run", aliases: [], sites: [
      "scripts/review-gate/providers/coderabbit/executable.ts",
      "scripts/review-gate/providers/coderabbit/process.ts",
    ].map((file) => declareInteractionSite(
      { file, kind: "subprocess", callee: "execa", occurrence: 1 },
      {
        acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "same", flags: [], acceptedSyntax: [] },
        mutationBoundary: "frontline provider subprocess boundary", subprocess: "close-stdin",
      },
    )),
  },
] satisfies readonly CommandInputDeclaration[];

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface ReviewPlanningLaneOptions {
  repository?: string;
}

export interface ReviewPlanningLaneHandlerDependencies {
  classify(base: string, head: string, repository: string): Promise<"planning" | "reviewed">;
  write(text: string): void;
  writeError(text: string): void;
  setExitCode(code: number): void;
}

function defaultReviewPlanningLaneDependencies(): ReviewPlanningLaneHandlerDependencies {
  return {
    classify: async (base, head, repository) => classifyPlanningLane(
      await resolveChangeSet(createRawGitExec(repository), base, head),
    ),
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  };
}

/**
 * Classify one exact Git change as planning or reviewed for the merge guard.
 *
 * @param base - Exact base commit SHA.
 * @param head - Exact proposed-head commit SHA.
 * @param options - Repository location containing both commits.
 * @param overrides - Test-only classifier and output boundaries.
 */
export async function handleReviewPlanningLane(
  base: string,
  head: string,
  options: ReviewPlanningLaneOptions,
  overrides: Partial<ReviewPlanningLaneHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultReviewPlanningLaneDependencies(), ...overrides };
  const input = ReviewPlanningLaneInputSchema.safeParse({
    base,
    head,
    ...(options.repository === undefined ? {} : { repository: options.repository }),
  });
  if (!input.success) {
    dependencies.writeError("planning-lane: invalid exact-change operands\n");
    dependencies.setExitCode(64);
    return;
  }
  let result: "planning" | "reviewed";
  try {
    result = await dependencies.classify(
      input.data.base,
      input.data.head,
      input.data.repository ?? process.cwd(),
    );
  } catch {
    dependencies.writeError("planning-lane classification failed\n");
    dependencies.setExitCode(1);
    return;
  }
  dependencies.write(`${result}\n`);
}

interface ReviewHandlerBoundary {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultReviewHandlerBoundary(): ReviewHandlerBoundary {
  return {
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  };
}

export interface ReviewResolveHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  resolve(request: ReviewPolicyCommandRequest, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultReviewResolveDependencies(): ReviewResolveHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    resolve: resolveConfiguredReviewPolicy,
  };
}

async function resolveConfiguredReviewPolicy(
  request: ReviewPolicyCommandRequest,
  root: string,
): Promise<unknown> {
  const { settings } = await readConfigSettings(root);
  const { sources, maxPasses } = await resolveConfiguredLanePolicy({
    lane: request.lane,
    settings,
    preferences: createLocalFrontlineSourcePreferenceReader({
      cwd: root,
      exec: gitExec,
      readFile: (path) => readFile(path, "utf8"),
    }),
  });
  return resolveReviewPolicy({ ...request, sources, maxPasses });
}

export interface ReviewReadinessHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  check(request: ReviewReadinessRequest, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/**
 * Bind readiness to one repository's delivery state.
 *
 * The root is the composition root's own resolved root — never the request's
 * supplied lifecycle-product root, and never a module-internal read of the
 * process working directory. It is the resolved ARC root rather than the
 * Git repository root; the Git-common publisher resolves the common directory
 * from any path inside the repository, so binding from it is correct.
 *
 * @param root - Resolved root of the repository whose delivery state answers.
 * @returns A readiness evaluation whose member arm reads that repository.
 */
function readinessBoundTo(
  root: string,
): (request: ReviewReadinessRequest) => Promise<ReviewReadinessEnvelope> {
  const deliveryMemberLookup = new RepositoryDeliveryMemberLookup({ exec: gitExec, cwd: root });
  return (request) => evaluateReviewReadiness(request, { deliveryMemberLookup });
}

function defaultReviewReadinessDependencies(): ReviewReadinessHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    check: (request, root) => readinessBoundTo(root)(request),
  };
}

/**
 * Evaluate exact-head vehicle readiness and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewReadiness(
  source: string,
  overrides: Partial<ReviewReadinessHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultReviewReadinessDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-readiness",
    source,
    requestSchema: ReviewReadinessRequestSchema,
    resultSchema: ReviewReadinessEnvelopeSchema,
    dependencies,
    execute: (request, root) => dependencies.check(
      ReviewReadinessRequestSchema.parse(request),
      root,
    ),
  });
}

/** Modes carried by the review-command family and by the merge-lock family that split from it. */
type ReviewFamilyMode = ReviewCommandMode | MergeLockCommandMode;

export interface MergeLockResolveHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  resolve(request: MergeLockResolveRequest, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

export interface MergeLockTransitionHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  transition(request: MergeLockTransitionRequest, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/**
 * Construct the merge-lock port shared by resolve, hold, and release.
 *
 * @param root - Resolved root the port's readiness gate authenticates against.
 * @param runner - Hosted process boundary; defaults to the `gh` runner.
 * @returns A merge-lock port bound to that repository.
 */
export function defaultMergeLockPort(
  root: string,
  runner: HostedProcessRunner = hostedGhRunner,
): MergeLockPort {
  return new GhMergeLockPort(runner, readinessBoundTo(root), readMergeLockSetting);
}

/**
 * Answer how a pull request about to be opened should be opened, as one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleMergeLockResolve(
  source: string,
  overrides: Partial<MergeLockResolveHandlerDependencies> = {},
): Promise<void> {
  const dependencies: MergeLockResolveHandlerDependencies = {
    ...defaultReviewHandlerBoundary(),
    resolve: (request, root) => resolveMergeLock(request, defaultMergeLockPort(root)),
    ...overrides,
  };
  await executeReviewHandler({
    mode: "merge-lock-resolve",
    source,
    requestSchema: MergeLockResolveRequestSchema,
    resultSchema: MergeLockResolveEnvelopeSchema,
    errorSchema: MergeLockCommandErrorEnvelopeSchema,
    dependencies,
    execute: (request, root) => dependencies.resolve(
      MergeLockResolveRequestSchema.parse(request),
      root,
    ),
  });
}

async function handleMergeLockTransition(
  mode: Extract<MergeLockCommandMode, "merge-lock-hold" | "merge-lock-release">,
  resultSchema: ZodType,
  verb: (request: MergeLockTransitionRequest, port: MergeLockPort) => Promise<unknown>,
  source: string,
  overrides: Partial<MergeLockTransitionHandlerDependencies>,
): Promise<void> {
  const dependencies: MergeLockTransitionHandlerDependencies = {
    ...defaultReviewHandlerBoundary(),
    transition: (request, root) => verb(request, defaultMergeLockPort(root)),
    ...overrides,
  };
  await executeReviewHandler({
    mode,
    source,
    requestSchema: MergeLockTransitionRequestSchema,
    resultSchema,
    errorSchema: MergeLockCommandErrorEnvelopeSchema,
    dependencies,
    execute: (request, root) => dependencies.transition(
      MergeLockTransitionRequestSchema.parse(request),
      root,
    ),
  });
}

/**
 * Lock one live pull request and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleMergeLockHold(
  source: string,
  overrides: Partial<MergeLockTransitionHandlerDependencies> = {},
): Promise<void> {
  await handleMergeLockTransition(
    "merge-lock-hold",
    MergeLockHoldEnvelopeSchema,
    holdMergeLock,
    source,
    overrides,
  );
}

/**
 * Unlock one live pull request and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleMergeLockRelease(
  source: string,
  overrides: Partial<MergeLockTransitionHandlerDependencies> = {},
): Promise<void> {
  await handleMergeLockTransition(
    "merge-lock-release",
    MergeLockReleaseEnvelopeSchema,
    releaseMergeLock,
    source,
    overrides,
  );
}

/**
 * Resolve one review-policy transition and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewResolve(
  source: string,
  overrides: Partial<ReviewResolveHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultReviewResolveDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-resolve",
    source,
    requestSchema: ReviewPolicyCommandRequestSchema,
    resultSchema: ReviewResolveEnvelopeSchema,
    dependencies,
    execute: (request, root) => dependencies.resolve(
      ReviewPolicyCommandRequestSchema.parse(request),
      root,
    ),
  });
}

export interface ReviewFrontlineResolveHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  resolve(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

type ReviewHandlerErrorPhase = "request" | "execution" | "output";

type HostedReviewHandlerMode =
  | "review-hosted-request"
  | "review-hosted-await"
  | "review-hosted-settle";

type HostedReviewHandlerBoundary = Pick<
  ReviewHandlerBoundary,
  "readText" | "write" | "setExitCode"
>;

const DURABLE_CORRUPTION_CODES = new Set([
  "invalid-receipt-reference",
  "malformed-frontline-outcome",
  "malformed-ledger",
  "malformed-operation-state",
  "operation-id-mismatch",
  "repository-mismatch",
]);

function errorCode(error: unknown): string | null {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : null;
}

async function executeReviewHandler(input: {
  mode: ReviewFamilyMode;
  source: string;
  requestSchema: ZodType;
  resultSchema: ZodType;
  /** Error envelope owning `input.mode`; the review family's own by default. */
  errorSchema?: ZodType;
  dependencies: ReviewHandlerBoundary;
  execute(request: unknown, root: string): Promise<unknown>;
}): Promise<void> {
  const errorSchema = input.errorSchema ?? ReviewCommandErrorEnvelopeSchema;
  const operand = ReviewCommandInputSchema.safeParse({ input: input.source });
  if (!operand.success) {
    emitReviewCommandError(input.mode, operand.error, "request", input.dependencies, errorSchema);
    return;
  }

  let root: string;
  try {
    const resolved = input.dependencies.resolveRoot(process.cwd());
    if (resolved === null) throw new Error("Not inside an ARC project.");
    root = resolved;
  } catch (error) {
    emitReviewCommandError(input.mode, error, "execution", input.dependencies, errorSchema);
    return;
  }

  let request: unknown;
  try {
    request = input.requestSchema.parse(JSON.parse(await input.dependencies.readText(operand.data.input)));
  } catch (error) {
    emitReviewCommandError(input.mode, error, "request", input.dependencies, errorSchema);
    return;
  }

  let rawResult: unknown;
  try {
    rawResult = await input.execute(request, root);
  } catch (error) {
    emitReviewCommandError(input.mode, error, "execution", input.dependencies, errorSchema);
    return;
  }

  try {
    const result = input.resultSchema.parse(rawResult);
    input.dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    emitReviewCommandError(input.mode, error, "output", input.dependencies, errorSchema);
  }
}

async function executeHostedReviewHandler(input: {
  mode: HostedReviewHandlerMode;
  source: string;
  requestSchema: ZodType;
  resultSchema: ZodType;
  dependencies: HostedReviewHandlerBoundary;
  execute(request: unknown): Promise<unknown>;
}): Promise<void> {
  const operand = ReviewCommandInputSchema.safeParse({ input: input.source });
  if (!operand.success) {
    emitHostedReviewError(input.mode, operand.error, "request", input.dependencies);
    return;
  }

  let request: unknown;
  try {
    request = input.requestSchema.parse(JSON.parse(await input.dependencies.readText(operand.data.input)));
  } catch (error) {
    emitHostedReviewError(input.mode, error, "request", input.dependencies);
    return;
  }

  let rawResult: unknown;
  try {
    rawResult = await input.execute(request);
  } catch (error) {
    emitHostedReviewError(input.mode, error, "execution", input.dependencies);
    return;
  }

  try {
    const result = input.resultSchema.parse(rawResult);
    input.dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    emitHostedReviewError(input.mode, error, "output", input.dependencies);
  }
}

function emitHostedReviewError(
  mode: HostedReviewHandlerMode,
  error: unknown,
  phase: ReviewHandlerErrorPhase,
  dependencies: Pick<HostedReviewHandlerBoundary, "write" | "setExitCode">,
): void {
  dependencies.write(`${JSON.stringify(reviewCommandError(mode, error, phase, ReviewCommandErrorEnvelopeSchema))}\n`);
  dependencies.setExitCode(1);
}

function emitReviewCommandError(
  mode: ReviewFamilyMode,
  error: unknown,
  phase: ReviewHandlerErrorPhase,
  dependencies: Pick<ReviewHandlerBoundary, "write" | "setExitCode">,
  errorSchema: ZodType,
): void {
  dependencies.write(`${JSON.stringify(reviewCommandError(mode, error, phase, errorSchema))}\n`);
  dependencies.setExitCode(1);
}

function defaultHostedHandlerBoundary(): HostedReviewHandlerBoundary {
  const boundary = defaultReviewHandlerBoundary();
  return {
    readText: (source) => boundary.readText(source),
    write: (text) => {
      boundary.write(text);
    },
    setExitCode: (code) => {
      boundary.setExitCode(code);
    },
  };
}

function createHostedAdapters(): {
  adapters: readonly HostedReviewAdapter[];
  observers: readonly HostedReviewObserver[];
  port: HostedSettlementPort;
} {
  const port = new GhHostedReviewPort(hostedGhRunner);
  const adapters = [
    new CodeRabbitHostedAdapter(port),
    new CodexHostedAdapter(port),
  ];
  return { adapters, observers: adapters, port };
}

type HostedProgressVehicle = HostedRequestVehicle | HostedErrandProgressBinding;

async function resolveHostedProgressContext(input: {
  root: string;
  publisher: RepositoryGitCommonStatePublisher;
  target: HostedTarget;
  provider: HostedProviderId;
  vehicle?: HostedProgressVehicle;
  settings?: Awaited<ReturnType<typeof readConfigSettings>>["settings"];
}) {
  const settings = input.settings ?? (await readConfigSettings(input.root)).settings;
  const baseRef = settings["branch.base"];
  const repositoryId = await resolveRepositoryIdentity(input.publisher);
  const memberLookup = new RepositoryDeliveryMemberLookup({ exec: gitExec, cwd: input.root });
  const memberResolution = await memberLookup.resolveMemberByHead(
    input.vehicle?.kind === "delivery-member" ? input.vehicle.head : input.target.headSha,
  );
  if (input.vehicle?.kind === "delivery-member") {
    if (memberResolution.status === "unavailable") {
      throw new Error("Hosted delivery-member binding is unavailable.");
    }
    if (memberResolution.status === "unbound"
      || memberResolution.member.planId !== input.vehicle.planId
      || memberResolution.member.deliverableId !== input.vehicle.deliverableId
      || memberResolution.member.head !== input.vehicle.head) {
      throw new Error("Hosted delivery-member binding does not match the requested member.");
    }
  }
  const member = memberResolution.status === "resolved"
    && (input.vehicle?.kind === "delivery-member" || !memberResolution.member.isFinalMember)
    ? memberResolution.member
    : null;
  const reviewTarget = member === null
    ? await deriveLocalReviewTarget({
        exec: gitExec,
        cwd: input.root,
        baseRef,
        repositoryId,
      })
    : await composeDeliveryMemberTarget({
        exec: gitExec,
        cwd: input.root,
        baseRef,
        repositoryId,
        member,
      });
  if (reviewTarget.headSha !== input.target.headSha) {
    throw new Error("Hosted review target does not match the current local review target.");
  }
  const currentBranch = (await gitExec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: input.root,
  })).stdout.trim();
  if (currentBranch === "" || currentBranch === "HEAD") {
    throw new Error("Hosted review requires an attached originating branch.");
  }
  const branch = resolveReviewHeadRef(currentBranch, member);
  const acceptableBaseRefs = member?.baseRef === null || member === null ? [] : [member.baseRef];
  const changeRequest = await resolveChangeRequest(
    { headRef: branch, headSha: reviewTarget.headSha, baseRef, acceptableBaseRefs, requireRemote: true },
    createGhChangeRequestResolutionPort(gitExec, input.root),
  );
  if (changeRequest.state !== "open"
    || changeRequest.targetRef.repository.toLowerCase() !== input.target.repository.toLowerCase()
    || changeRequest.candidate.number !== input.target.pullRequest
    || !new Set([baseRef, ...acceptableBaseRefs]).has(changeRequest.candidate.baseRefName)) {
    throw new Error("Hosted review target does not identify the current open change request.");
  }
  const store = new LocalReviewOperationStateStore(input.publisher);
  const progress = await readLaneProgress(store, {
    lane: "standard",
    repositoryId,
    headSha: reviewTarget.headSha,
  });
  const attempts = progress.status === "recorded"
    ? progress.attempts.filter((attempt) => (
        attempt.hosted !== undefined
        && attempt.hosted.target.repository.toLowerCase() === input.target.repository.toLowerCase()
        && attempt.hosted.target.pullRequest === input.target.pullRequest
        && attempt.hosted.target.headSha === input.target.headSha
      ))
    : [];
  if (input.vehicle?.kind === "errand") {
    const identity = await resolveUserIdentity(gitExec);
    const frame = await runDerivedLocusStateProbe({
      cwd: input.root,
      identity,
      baseBranch: baseRef,
      exec: gitExec,
    });
    const current = resolveActiveHostedReviewErrand(frame, branch);
    const configuredSources = (await resolveConfiguredLanePolicy({
      lane: "standard",
      settings,
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: input.root,
        exec: gitExec,
        readFile: (path) => readFile(path, "utf8"),
      }),
    })).sources;
    const errandBinding = "key" in input.vehicle
      ? HostedErrandProgressBindingSchema.parse(input.vehicle)
      : HostedErrandProgressBindingSchema.parse({
          kind: "errand",
          ...current,
          sources: configuredSourceSuffix(configuredSources, input.provider),
          standardReview: input.vehicle.standardReview,
        });
    assertHostedErrandBindingAuthority({
      binding: errandBinding,
      configuredSources,
      rubricIdentity: STANDARD_REVIEW_RUBRIC_IDENTITY,
    });
    assertHostedErrandAdmission({
      binding: errandBinding,
      current,
      provider: input.provider,
      attempts,
    });
    const requirement = createReviewRequirement({
      target: reviewTarget,
      projection: errandBinding.standardReview,
      acceptableSources: [{ sourceKind: "hosted", qualifier: input.provider }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("Hosted Errand progress does not carry an obligation.");
    return { store, repositoryId, reviewTarget, requirement, errandBinding };
  }

  const active = member === null ? await resolveActiveWu({ cwd: input.root }) : null;
  const workUnitId = member?.workUnitId
    ?? (active?.status === "resolved" && active.name !== "" ? active.name : null);
  if (workUnitId === null) {
    throw new Error("Hosted review progress requires one active work unit or an explicit vehicle.");
  }
  const boundary = (await readSubmissionBoundaryVersioned(input.root, workUnitId)).boundary;
  if (boundary?.reservation === null || boundary?.reservation === undefined) {
    throw new Error("Hosted review progress requires the carried standard-review reservation.");
  }
  const reservation = boundary.reservation;
  const candidate = await createPrePublicationCompositionDependencies({
    cwd: input.root,
    exec: gitExec,
  }).readCandidate(workUnitId);
  if (candidate.status !== "current") {
    throw new Error("Hosted review reservation requires a current Candidate.");
  }
  assertHostedReservationAdmission({
    reservation,
    provider: input.provider,
    repository: input.target.repository,
    headSha: input.target.headSha,
    targetKind: reviewTarget.kind,
    boundary: {
      candidateId: boundary.candidateId,
      candidateSubjectDigest: boundary.candidateSubjectDigest,
    },
    candidate: {
      candidateId: candidate.candidateId,
      subjectDigest: candidate.subjectDigest,
      headSha: candidate.headSha,
    },
    attempts,
  });
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: reservation.obligation,
    acceptableSources: [{ sourceKind: "hosted", qualifier: input.provider }],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("Hosted review reservation does not carry an obligation.");
  return { store, repositoryId, reviewTarget, requirement, errandBinding: null };
}

function defaultFrontlineResolveDependencies(): ReviewFrontlineResolveHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    resolve: (request, root) => resolveFrontlineCommand(request, {
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: root,
        exec: gitExec,
        readFile: (path) => readFile(path, "utf8"),
      }),
      registry: new FrontlineSourceRegistry([CODERABBIT_FRONTLINE_REGISTRATION]),
    }),
  };
}

/**
 * Resolve one explicit frontline request and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewFrontlineResolve(
  source: string,
  overrides: Partial<ReviewFrontlineResolveHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultFrontlineResolveDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-frontline-resolve",
    source,
    requestSchema: FrontlineCommandRequestSchema,
    resultSchema: FrontlineResolveEnvelopeSchema,
    dependencies,
    execute: dependencies.resolve,
  });
}

export interface ReviewChunkingResolveHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  resolve(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultReviewChunkingResolveDependencies(): ReviewChunkingResolveHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    resolve: async (request, root) => {
      const parsed = ReviewChunkingResolveRequestSchema.parse(request);
      const exec = createGitExec();
      const publisher = new RepositoryGitCommonStatePublisher(exec, root);
      const planStore = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
      const stateStore = new RepositoryDeliveryStateStore(publisher);
      const active = await resolveActiveWu({ cwd: root });
      const workUnitId = active.status === "resolved" && active.name !== ""
        ? active.name
        : active.status === "none"
          ? null
          : undefined;
      const bindingLookup = new DeliveryBindingLookup({
        enumeratePlans: () => planStore.enumerateCurrent(),
        readState: (planId) => stateStore.read(planId),
        resolveMember: (input) => stateStore.resolveMember(input),
      });
      return resolveReviewChunkingCommand(parsed, {
        readSettings: () => readConfigSettings(root),
        readDeliveryBinding: () => workUnitId === undefined
          ? Promise.resolve({ status: "unavailable", reason: "owning-work-unit-unresolved" })
          : bindingLookup.resolve({ target: parsed.target, workUnitId }),
        exec: createRawGitExec(root),
      });
    },
  };
}

/**
 * Resolve one exact target's review-chunking recommendation as JSON.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewChunkingResolve(
  source: string,
  overrides: Partial<ReviewChunkingResolveHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultReviewChunkingResolveDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-chunking-resolve",
    source,
    requestSchema: ReviewChunkingResolveRequestSchema,
    resultSchema: ReviewChunkingResolveEnvelopeSchema,
    dependencies,
    execute: dependencies.resolve,
  });
}

export interface ReviewFrontlineRunHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  run(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultFrontlineRunDependencies(context: InteractionContext): ReviewFrontlineRunHandlerDependencies {
  const exec = createGitExec(context.subprocess);
  return {
    ...defaultReviewHandlerBoundary(),
    run: (request, root) => runFrontlineReviewCommand(
      request,
      createFrontlineRunDependencies({ exec, cwd: root, interaction: context.subprocess }),
    ),
  };
}

/**
 * Execute one exact-target frontline review and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @param suppliedContext - Adapter-resolved interaction and subprocess policy.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewFrontlineRun(
  source: string,
  overrides: Partial<ReviewFrontlineRunHandlerDependencies> = {},
  suppliedContext?: InteractionContext,
): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false,
    machineReadable: true,
    yes: "absent",
  });
  const dependencies = { ...defaultFrontlineRunDependencies(context), ...overrides };
  await executeReviewHandler({
    mode: "review-frontline-run",
    source,
    requestSchema: FrontlineRunRequestSchema,
    resultSchema: FrontlineRunEnvelopeSchema,
    dependencies,
    execute: dependencies.run,
  });
}

export interface ReviewLocalPrepareHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  prepare(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultLocalPrepareDependencies(): ReviewLocalPrepareHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    prepare: (request, root) => prepareLocalReview(
      request,
      createLocalPrepareDependencies({ exec: gitExec, cwd: root }),
    ),
  };
}

function repositoryPrecondition(reason: LocalTargetInvalidReason) {
  switch (reason) {
    case "unborn-repository":
      return "repository-born" as const;
    case "dirty-worktree":
      return "clean-worktree" as const;
    case "non-commit-head":
      return "commit-head" as const;
    case "invalid-base":
    case "no-merge-base":
    case "unresolved-base":
      return "base-resolved" as const;
  }
}

function reviewCommandError(
  mode: ReviewFamilyMode,
  error: unknown,
  phase: ReviewHandlerErrorPhase,
  errorSchema: ZodType,
  remedyFor?: (code: ReviewCommandErrorCode) => SpineRemedy,
) {
  const message = error instanceof Error ? error.message : String(error);
  const stableCode = errorCode(error);
  const code = error instanceof LocalTargetDerivationError
    ? "invalid-input"
    : phase === "request" && (error instanceof ZodError || error instanceof SyntaxError)
      ? "invalid-input"
      : stableCode === "invalid-input" || stableCode === "corrupt-state"
        ? stableCode
        : stableCode !== null && DURABLE_CORRUPTION_CODES.has(stableCode)
          ? "corrupt-state"
          : "unexpected-failure";
  const diagnostics = error instanceof LocalTargetDerivationError
    ? [{
        code: "repository-precondition" as const,
        message,
        precondition: repositoryPrecondition(error.reason),
      }]
    : [];
  return errorSchema.parse({
    schemaVersion: 1,
    mode,
    diagnostics,
    error: { code, message },
    ...(remedyFor === undefined ? {} : { remedy: remedyFor(code) }),
  });
}

/**
 * Prepare one immutable local review and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewLocalPrepare(
  source: string,
  overrides: Partial<ReviewLocalPrepareHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultLocalPrepareDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-local-prepare",
    source,
    requestSchema: LocalPrepareRequestSchema,
    resultSchema: LocalPrepareEnvelopeSchema,
    dependencies,
    execute: dependencies.prepare,
  });
}

export interface ReviewLocalAttestHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  attest(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultLocalAttestDependencies(): ReviewLocalAttestHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    attest: (request, root) => attestLocalReviewCommand(
      request,
      createLocalAttestDependencies({ exec: gitExec, cwd: root }),
    ),
  };
}

/**
 * Attest one normalized local review result and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewLocalAttest(
  source: string,
  overrides: Partial<ReviewLocalAttestHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultLocalAttestDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-local-attest",
    source,
    requestSchema: LocalAttestRequestSchema,
    resultSchema: LocalAttestEnvelopeSchema,
    dependencies,
    execute: dependencies.attest,
  });
}

export interface ReviewLocalResumeHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  resume(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultLocalResumeDependencies(): ReviewLocalResumeHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    resume: (request, root) => resumeLocalReviewCommand(
      request,
      createLocalResumeDependencies({ exec: gitExec, cwd: root }),
    ),
  };
}

/**
 * Resume one durable local review and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewLocalResume(
  source: string,
  overrides: Partial<ReviewLocalResumeHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultLocalResumeDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-local-resume",
    source,
    requestSchema: LocalResumeRequestSchema,
    resultSchema: LocalResumeEnvelopeSchema,
    dependencies,
    execute: dependencies.resume,
  });
}

export interface ReviewRespondHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  respond(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultRespondDependencies(): ReviewRespondHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    respond: (request, root) => respondToReviewCommand(
      request,
      createRespondDependencies({ exec: gitExec, cwd: root }),
    ),
  };
}

/** Prepare or persist one source-bound disposition set. */
export async function handleReviewRespond(
  source: string,
  overrides: Partial<ReviewRespondHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultRespondDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-respond",
    source,
    requestSchema: RespondRequestSchema,
    resultSchema: RespondEnvelopeSchema,
    dependencies,
    execute: dependencies.respond,
  });
}

export interface ReviewReduceHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  reduce(request: unknown, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultReduceDependencies(): ReviewReduceHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    reduce: (request, root) => reduceReviewCommand(
      request,
      createReduceDependencies({ exec: gitExec, cwd: root }),
    ),
  };
}

/** Reduce one durable review operation without advancing or appending state. */
export async function handleReviewReduce(
  source: string,
  overrides: Partial<ReviewReduceHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultReduceDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-reduce",
    source,
    requestSchema: ReduceRequestSchema,
    resultSchema: ReduceEnvelopeSchema,
    dependencies,
    execute: dependencies.reduce,
  });
}

/**
 * Request one hosted pull-request review and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only hosted request boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export interface ReviewHostedRequestHandlerDependencies extends HostedReviewHandlerBoundary {
  request(input: unknown): Promise<unknown>;
}

function defaultHostedRequestDependencies(): ReviewHostedRequestHandlerDependencies {
  const { adapters, port } = createHostedAdapters();
  const root = resolveArcRoot(process.cwd());
  const publisher = root === null ? null : new RepositoryGitCommonStatePublisher(gitExec, root);
  return {
    ...defaultHostedHandlerBoundary(),
    request: async (input) => {
      if (root === null || publisher === null) throw new Error("Hosted review requires an ARC project.");
      const request = HostedRequestEnvelopeSchema.parse(input);
      const context = await resolveHostedProgressContext({
        root,
        publisher,
        target: request.target,
        provider: request.provider,
        ...(request.vehicle === undefined ? {} : { vehicle: request.vehicle }),
      });
      const result = await requestHostedReview(request, {
        adapters,
        deliveryMemberLookup: new RepositoryDeliveryMemberLookup({ exec: gitExec, cwd: root }),
        ...(context.errandBinding === null ? {} : { errandBinding: context.errandBinding }),
      });
      if (result.nextAction === "try-next-source") {
        await recordHostedRequestUnavailableAttempt(context.store, {
          repositoryId: context.repositoryId,
          request,
          result,
          reviewTarget: context.reviewTarget,
          requirement: context.requirement,
          actorIdentity: await port.currentActorIdentity(),
          now: new Date().toISOString(),
        });
      }
      return result;
    },
  };
}

export async function handleReviewHostedRequest(
  source: string,
  overrides: Partial<ReviewHostedRequestHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultHostedRequestDependencies(), ...overrides };
  await executeHostedReviewHandler({
    mode: "review-hosted-request",
    source,
    requestSchema: HostedRequestEnvelopeSchema,
    resultSchema: HostedRequestResultSchema,
    dependencies,
    execute: dependencies.request,
  });
}

/**
 * Await one already-requested hosted review and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only hosted await boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export interface ReviewHostedAwaitHandlerDependencies extends HostedReviewHandlerBoundary {
  awaitResult(input: unknown): Promise<unknown>;
}

function defaultHostedAwaitDependencies(): ReviewHostedAwaitHandlerDependencies {
  const { observers, port } = createHostedAdapters();
  const root = resolveArcRoot(process.cwd());
  const publisher = root === null ? null : new RepositoryGitCommonStatePublisher(gitExec, root);
  return {
    ...defaultHostedHandlerBoundary(),
    awaitResult: async (input) => {
      if (publisher === null || root === null) throw new Error("Hosted review requires an ARC project.");
      const request = HostedAwaitEnvelopeSchema.parse(input);
      const settings = (await readConfigSettings(root)).settings;
      const timing = resolveHostedAwaitTiming(request, settings);
      const context = await resolveHostedProgressContext({
        root,
        publisher,
        target: request.handle.target,
        provider: request.handle.provider,
        ...(request.handle.vehicle === undefined ? {} : { vehicle: request.handle.vehicle }),
        settings,
      });
      const result = await awaitHostedReview(timing.request, {
        observers,
        attentionAfterMs: timing.attentionAfterMs,
        clock: {
          now: () => Date.now(),
          sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
        },
      });
      if (result.state === "pending") return result;
      const progress = await recordHostedAwaitAttempt(context.store, {
        repositoryId: context.repositoryId,
        result,
        reviewTarget: context.reviewTarget,
        requirement: context.requirement,
        actorIdentity: await port.currentActorIdentity(),
        now: new Date().toISOString(),
      });
      return result.state === "findings" && progress !== null
        ? {
            ...result,
            responseSourceRef: bindReviewSourceReference({
              kind: "hosted",
              operationId: progress.operationId,
              durableRef: hostedLaneAttemptId(result.handle),
            }),
          }
        : result;
    },
  };
}

export async function handleReviewHostedAwait(
  source: string,
  overrides: Partial<ReviewHostedAwaitHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultHostedAwaitDependencies(), ...overrides };
  await executeHostedReviewHandler({
    mode: "review-hosted-await",
    source,
    requestSchema: HostedAwaitEnvelopeSchema,
    resultSchema: HostedAwaitResultSchema,
    dependencies,
    execute: dependencies.awaitResult,
  });
}

/**
 * Settle one hosted finding and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only hosted settlement boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export interface ReviewHostedSettleHandlerDependencies extends HostedReviewHandlerBoundary {
  settle(input: unknown): Promise<unknown>;
}

function defaultHostedSettleDependencies(): ReviewHostedSettleHandlerDependencies {
  const { port } = createHostedAdapters();
  const root = resolveArcRoot(process.cwd());
  const publisher = root === null ? null : new RepositoryGitCommonStatePublisher(gitExec, root);
  return {
    ...defaultHostedHandlerBoundary(),
    settle: async (input) => {
      if (root === null || publisher === null) throw new Error("Hosted settlement requires an ARC project.");
      const request = HostedSettleEnvelopeSchema.parse(input);
      const reference = parseReviewSourceReference(request.response.attemptRef, "hosted");
      const operationStore = new LocalReviewOperationStateStore(publisher);
      const persisted = await operationStore.readOperation(reference.operationId);
      const attempt = persisted.state?.kind === "lane-progress"
        ? persisted.state.attempts.find(({ attemptId }) => attemptId === reference.durableRef)
        : undefined;
      const hosted = attempt?.hosted;
      const finding = hosted?.findings.find(({ findingId }) => findingId === request.response.findingId);
      if (persisted.state?.kind !== "lane-progress"
        || persisted.state.lane !== "standard"
        || attempt === undefined
        || hosted === undefined
        || hosted.dispositionSetId !== request.response.dispositionSetId
        || finding?.origin !== "review-thread"
        || finding.commentId !== request.finding.commentId
        || finding.threadId !== request.finding.threadId
        || hosted.actorIdentity !== request.actorIdentity
        || canonicalize(hosted.target) !== canonicalize(request.target)) {
        throw new Error("Hosted settlement does not match its approved findings attempt.");
      }
      const dispositionRecord = await new LocalApprovedDispositionRecordStore(publisher)
        .readDispositionRecord(attempt.attemptId);
      const disposition = dispositionRecord?.approvedDisposition.dispositionSet.findings
        .find(({ findingId }) => findingId === request.response.findingId);
      if (dispositionRecord?.approvedDisposition.dispositionSet.dispositionSetId
          !== request.response.dispositionSetId
        || disposition?.disposition !== request.disposition) {
        throw new Error("Hosted settlement does not match its approved disposition.");
      }
      const result = await settleHostedFinding(request, { port });
      if (result.state === "settled" || result.state === "already-settled") {
        await settleHostedAttemptFinding(operationStore, {
          operationId: reference.operationId,
          attemptId: reference.durableRef,
          dispositionSetId: request.response.dispositionSetId,
          findingId: request.response.findingId,
          now: new Date().toISOString(),
        });
      }
      return result;
    },
  };
}

export async function handleReviewHostedSettle(
  source: string,
  overrides: Partial<ReviewHostedSettleHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultHostedSettleDependencies(), ...overrides };
  await executeHostedReviewHandler({
    mode: "review-hosted-settle",
    source,
    requestSchema: HostedSettleEnvelopeSchema,
    resultSchema: HostedSettleResultSchema,
    dependencies,
    execute: dependencies.settle,
  });
}

/** Command-line options for `arc review pre-publication`. */
export interface ReviewPrePublicationOptions {
  selfReview?: string;
  changeSet?: string;
  lanes?: string;
  resume?: string;
  json?: boolean;
}

/** The caller's parsed judgment inputs, each absent unless its option named a source. */
export interface ReviewPrePublicationJudgment {
  selfReview: "settled" | undefined;
  changeSet: unknown;
  lanes: unknown;
}

export interface ReviewPrePublicationHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  compose(
    root: string,
    input: z.infer<typeof ReviewPrePublicationInputSchema>,
    judgment: ReviewPrePublicationJudgment,
  ): Promise<PrePublicationComposition>;
  persistBoundary(root: string, boundary: IntegrationBoundaryLocus): Promise<void>;
  write(text: string): void;
  warn(text: string): void;
  setExitCode(code: number): void;
}

function defaultPrePublicationDependencies(
  interaction?: InteractionContext,
): ReviewPrePublicationHandlerDependencies {
  const boundary = defaultReviewHandlerBoundary();
  const exec = createGitExec(interaction?.subprocess);
  const boundarySnapshots = new Map<string, Awaited<ReturnType<typeof readSubmissionBoundaryVersioned>>>();
  return {
    resolveRoot: (cwd) => boundary.resolveRoot(cwd),
    readText: (source) => boundary.readText(source),
    compose: async (root, input, judgment) => {
      const snapshot = await readSubmissionBoundaryVersioned(root, input.name);
      boundarySnapshots.set(input.name, snapshot);
      const composition = await composePrePublicationReviewRequest(
        {
          workUnit: input.name,
          ...(judgment.selfReview === undefined ? {} : { selfReview: judgment.selfReview }),
          ...(judgment.changeSet === undefined ? {} : { changeSet: judgment.changeSet }),
          ...(judgment.lanes === undefined ? {} : { lanes: judgment.lanes }),
        },
        createPrePublicationCompositionDependencies({ cwd: root, exec }),
      );
      const existing = snapshot.boundary;
      let carried = composition;
      if (existing?.reservation !== null && existing?.reservation !== undefined) {
        carried = applyCarriedStandardReviewReservation(carried, {
          candidateId: existing.candidateId,
          candidateSubjectDigest: existing.candidateSubjectDigest,
          reservation: existing.reservation,
        });
      }
      if (existing?.terminus !== null && existing?.terminus !== undefined) {
        carried = applyCarriedOwnerAcceptedTerminus(carried, {
          candidateId: existing.candidateId,
          candidateSubjectDigest: existing.candidateSubjectDigest,
          terminus: existing.terminus,
        });
      }
      return carried;
    },
    persistBoundary: async (root, settled) => {
      const snapshot = boundarySnapshots.get(settled.workUnit)
        ?? await readSubmissionBoundaryVersioned(root, settled.workUnit);
      const existing = snapshot.boundary;
      const preservesReservation = existing !== null
        && existing.candidateId === settled.candidateId
        && existing.candidateSubjectDigest !== null
        && existing.reservation !== null
        && settled.reservation === null
        && settled.terminus === null;
      const path = await writeSubmissionBoundary(root, parseIntegrationBoundaryLocus(preservesReservation
        ? { ...settled, reservation: existing.reservation }
        : settled), snapshot.version);
      await exec("git", ["add", "--", path], { cwd: root });
    },
    write: (text) => {
      boundary.write(text);
    },
    warn: (text) => {
      process.stderr.write(text);
    },
    setExitCode: (code) => {
      boundary.setExitCode(code);
    },
  };
}

/**
 * Resolve the typed pre-publication review procedure for one work unit.
 *
 * The command self-composes both lane policy requests from repository state. Its returned re-entry
 * command carries an opaque replay of caller-owned judgments that repository state cannot recover.
 * Two options report those judgments initially: `--self-review`, whether the author's self-review actually ran, and
 * `--change-set`, the routing facts the standard-review obligation turns on. Omitting the latter
 * routes the change set as unestablished, which is the conservative `required` route. `--lanes`
 * carries each lane's bounded review scope, the frontline lane's one-run invocation override,
 * any approved ceiling override, and an explicitly Owner-accepted standard-review terminus.
 *
 * @param name - The target work unit's slug.
 * @param options - Parsed command-line options.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout, stderr, and exit status are assigned.
 */
export async function handleReviewPrePublication(
  name: string,
  options: ReviewPrePublicationOptions,
  overrides: Partial<ReviewPrePublicationHandlerDependencies> = {},
  interaction?: InteractionContext,
): Promise<void> {
  const dependencies = { ...defaultPrePublicationDependencies(interaction), ...overrides };
  const target = SlugSchema.safeParse(name.trim());
  const remedyFor = (code: ReviewPrePublicationRefusalCode): SpineRemedy => target.success
    ? prePublicationRemedy(code, target.data)
    : prePublicationTargetRemedy();
  const emitFailure = (
    error: unknown,
    phase: "request" | "execution" | "output",
    code?: Extract<ReviewPrePublicationRefusalCode, "candidate-unexplained-delta">,
  ): void => {
    const envelope = code === undefined
      ? reviewCommandError(
          "review-pre-publication",
          error,
          phase,
          ReviewCommandErrorEnvelopeSchema,
          (genericCode: ReviewCommandErrorCode) => remedyFor(genericCode),
        )
      : ReviewCommandErrorEnvelopeSchema.parse({
          schemaVersion: 1,
          mode: "review-pre-publication",
          diagnostics: [],
          error: {
            code,
            message: error instanceof Error ? error.message : String(error),
          },
          remedy: remedyFor(code),
        });
    dependencies.write(`${JSON.stringify(envelope)}\n`);
    dependencies.setExitCode(1);
  };

  const input = ReviewPrePublicationInputSchema.safeParse({
    name: name.trim(),
    ...(options.selfReview === undefined ? {} : { selfReview: options.selfReview }),
    ...(options.changeSet === undefined ? {} : { changeSet: options.changeSet }),
    ...(options.lanes === undefined ? {} : { lanes: options.lanes }),
    ...(options.resume === undefined ? {} : { resume: options.resume }),
    json: options.json,
  });
  if (!input.success) {
    emitFailure(input.error, "request");
    return;
  }

  const readJudgment = async (source: string | undefined): Promise<unknown> =>
    source === undefined ? undefined : JSON.parse(await dependencies.readText(source));

  let judgment: ReviewPrePublicationJudgment;
  try {
    const resumed = input.data.resume === undefined
      ? null
      : z.strictObject({
          selfReview: z.literal("settled").optional(),
          changeSet: z.json().optional(),
          lanes: z.json().optional(),
        }).parse(JSON.parse(Buffer.from(input.data.resume, "base64url").toString("utf8")));
    judgment = resumed === null
      ? {
          selfReview: input.data.selfReview,
          changeSet: await readJudgment(input.data.changeSet),
          lanes: await readJudgment(input.data.lanes),
        }
      : {
          selfReview: resumed.selfReview,
          changeSet: resumed.changeSet,
          lanes: resumed.lanes,
        };
  } catch (error) {
    emitFailure(error, "request");
    return;
  }

  let root: string;
  try {
    const resolved = dependencies.resolveRoot(process.cwd());
    if (resolved === null) throw new Error("Not inside an ARC project.");
    root = resolved;
  } catch (error) {
    emitFailure(error, "execution");
    return;
  }

  let envelope: PrePublicationReviewEnvelope;
  try {
    const composition = await dependencies.compose(root, input.data, judgment);
    if (composition.status === "refused") {
      emitFailure(new Error(composition.reason), "execution", composition.code);
      return;
    }
    for (const advisory of composition.advisories) dependencies.warn(`${advisory}\n`);
    envelope = projectPrePublicationReview(composition.request);
    if (envelope.nextAction.kind === "continue-pre-publication-review"
      || envelope.nextAction.kind === "run-self-review") {
      // The run-self-review command is the re-entry *after* the method has run, so it carries
      // that prospective completion while preserving every other caller-owned judgment.
      const replaySelfReview = envelope.nextAction.kind === "run-self-review"
        ? "settled"
        : judgment.selfReview;
      const replayLanes = envelope.locus === "candidate-fix-pending"
        ? consumeOwnerAcceptedTerminus(judgment.lanes)
        : judgment.lanes;
      const resume = Buffer.from(canonicalize({
        ...(replaySelfReview === undefined ? {} : { selfReview: replaySelfReview }),
        ...(judgment.changeSet === undefined ? {} : { changeSet: judgment.changeSet }),
        ...(replayLanes === undefined ? {} : { lanes: replayLanes }),
      }), "utf8").toString("base64url");
      envelope = PrePublicationReviewEnvelopeSchema.parse({
        ...envelope,
        nextAction: {
          ...envelope.nextAction,
          command: `arc review pre-publication ${envelope.workUnit} --resume ${resume} --json`,
        },
      });
    }
    // The settled locus is where the durable publication boundary is written. Recording it here —
    // before the result is claimed — is what makes `arc publish` succeed on its first call; an
    // absent boundary now means genuinely open obligations rather than a write nobody performed.
    if (envelope.locus === "candidate-publish-ready"
      || envelope.locus === "candidate-convergence-verification-pending") {
      await dependencies.persistBoundary(root, prePublicationBoundary(envelope));
    }
  } catch (error) {
    emitFailure(error, "execution");
    return;
  }

  try {
    dependencies.write(`${JSON.stringify(PrePublicationReviewEnvelopeSchema.parse(envelope))}\n`);
  } catch (error) {
    emitFailure(error, "output");
  }
}
