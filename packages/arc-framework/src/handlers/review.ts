/** Machine-readable review workflow handlers. */

import { readFile } from "node:fs/promises";
import { z, ZodError, type ZodType } from "zod";

import { declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
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
import { resolveArcRoot } from "../lib/paths.js";
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
  type ReviewCommandMode,
} from "../scripts/review-gate/core/review-command-envelope.js";
import { ReviewChunkingResolveRequestSchema } from "../scripts/review-gate/core/review-chunking-command-schema.js";
import {
  createLocalFrontlineSourcePreferenceReader,
  parseReviewSourceIds,
} from "../scripts/review-gate/hosts/local/frontline-source-preferences.js";
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
import { readMergeLockSetting } from "../scripts/review-gate/hosts/local/merge-lock-config.js";
import { FrontlineSourceRegistry } from "../scripts/review-gate/policy/frontline-source.js";
import { resolveReviewChunkingCommand } from "../scripts/review-gate/policy/review-chunking-command.js";
import { CODERABBIT_FRONTLINE_REGISTRATION } from "../scripts/review-gate/providers/coderabbit/frontline-execution.js";
import {
  HostedRequestEnvelopeSchema,
  HostedRequestResultSchema,
  requestHostedReview,
  type HostedReviewAdapter,
} from "../scripts/review-gate/hosted/request.js";
import {
  HostedAwaitEnvelopeSchema,
  HostedAwaitResultSchema,
  awaitHostedReview,
  type HostedReviewObserver,
} from "../scripts/review-gate/hosted/await.js";
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
  ChangeRequestResolveInputSchema,
  resolveChangeRequest,
  type ChangeRequestResolveInput,
  type ChangeRequestResolveResult,
} from "../scripts/review-gate/change-request.js";
import { createGhChangeRequestResolutionPort } from "../scripts/review-gate/hosts/github/change-request.js";
import {
  MergeMethodSchema,
  resolveMergeMethod,
  type MergeMethodResolveResult,
} from "../scripts/review-gate/merge-method.js";
import { createGhMergeMethodPolicyPort } from "../scripts/review-gate/hosts/github/merge-method.js";
import {
  ChecksAwaitInputSchema,
  awaitRequiredChecks,
  type ChecksAwaitResult,
} from "../scripts/review-gate/checks-await.js";
import { createGhRequiredChecksPort } from "../scripts/review-gate/hosts/github/checks-await.js";

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
  schema: ChangeRequestResolveInputSchema,
  schemaFields: {
    "option.head-ref": "headRef",
    "option.head-sha": "headSha",
  },
};

const reviewChecksAwaitInputRegistration: CommandInputRegistration = {
  commandPath: "review checks await",
  schema: ChecksAwaitInputSchema,
  schemaFields: {
    "option.pull-request": "pullRequest",
    "option.head-sha": "headSha",
    "option.timeout-ms": "timeoutMs",
    "option.poll-interval-ms": "pollIntervalMs",
  },
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
] satisfies readonly CommandInputRegistration[];

export interface ReviewChangeRequestResolveOptions {
  headRef: string;
  headSha: string;
  json?: boolean;
}

export interface ReviewChangeRequestResolveHandlerDependencies {
  resolve(input: ChangeRequestResolveInput, cwd: string): Promise<ChangeRequestResolveResult>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Resolve one exact head's host-anchored change-request disposition. */
export async function handleReviewChangeRequestResolve(
  options: ReviewChangeRequestResolveOptions,
  overrides: Partial<ReviewChangeRequestResolveHandlerDependencies> = {},
): Promise<void> {
  const exec = createGitExec();
  const dependencies: ReviewChangeRequestResolveHandlerDependencies = {
    resolve: (input, cwd) => resolveChangeRequest(input, createGhChangeRequestResolutionPort(exec, cwd)),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => { process.exitCode = code; },
    ...overrides,
  };
  const parsed = ChangeRequestResolveInputSchema.safeParse({
    headRef: options.headRef,
    headSha: options.headSha,
  });
  if (!parsed.success) {
    dependencies.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      detail: parsed.error.issues.map((issue) => issue.message).join("; "),
    })}\n`);
    dependencies.setExitCode(64);
    return;
  }
  const result = await dependencies.resolve(parsed.data, process.cwd());
  dependencies.write(`${JSON.stringify(result)}\n`);
}

export interface ReviewMergeMethodResolveOptions {
  json?: boolean;
}

export interface ReviewMergeMethodResolveHandlerDependencies {
  readConfiguredMethod(cwd: string): Promise<"merge" | "rebase" | "squash">;
  resolve(method: "merge" | "rebase" | "squash"): Promise<MergeMethodResolveResult>;
  write(text: string): void;
}

/** Validate the configured merge method against live repository policy. */
export async function handleReviewMergeMethodResolve(
  _options: ReviewMergeMethodResolveOptions,
  overrides: Partial<ReviewMergeMethodResolveHandlerDependencies> = {},
): Promise<void> {
  const port = createGhMergeMethodPolicyPort(hostedGhRunner);
  const dependencies: ReviewMergeMethodResolveHandlerDependencies = {
    readConfiguredMethod: async (cwd) => MergeMethodSchema.parse(
      (await readConfigSettings(cwd)).settings["merge.strategy"],
    ),
    resolve: (method) => resolveMergeMethod(method, port),
    write: (text) => process.stdout.write(text),
    ...overrides,
  };
  const configuredMethod = await dependencies.readConfiguredMethod(process.cwd());
  dependencies.write(`${JSON.stringify(await dependencies.resolve(configuredMethod))}\n`);
}

export interface ReviewChecksAwaitOptions {
  pullRequest: string;
  headSha: string;
  timeoutMs: string;
  pollIntervalMs: string;
  json?: boolean;
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
    pullRequest: Number(options.pullRequest),
    headSha: options.headSha,
    timeoutMs: Number(options.timeoutMs),
    pollIntervalMs: Number(options.pollIntervalMs),
  });
  if (!parsed.success) {
    dependencies.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "review-checks-await",
      state: "blocked",
      nextAction: "stop",
      reason: "invalid-input",
      detail: parsed.error.issues.map((issue) => issue.message).join("; "),
    })}\n`);
    dependencies.setExitCode(64);
    return;
  }
  dependencies.write(`${JSON.stringify(await dependencies.awaitChecks(parsed.data))}\n`);
}

/** Input and interaction policies owned by the review command adapters. */
export const reviewCommandInputPolicyDeclarations = [
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
  let sources: readonly string[] | undefined;
  if (request.lane === "frontline") {
    const preferences = createLocalFrontlineSourcePreferenceReader({
      cwd: root,
      exec: gitExec,
      readFile: (path) => readFile(path, "utf8"),
    });
    const developerSources = await preferences.readDeveloperSourceIds();
    sources = developerSources.length > 0
      ? developerSources
      : await preferences.readProjectSourceIds();
  }
  sources ??= parseReviewSourceIds(settings["review.standard_sources"]);
  const maxPasses = Number(
    settings[request.lane === "frontline"
      ? "review.frontline_max_passes"
      : "review.standard_max_passes"],
  );
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
    resolve: (request, root) => resolveReviewChunkingCommand(request, {
      readSettings: () => readConfigSettings(root),
      exec: createRawGitExec(root),
    }),
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
  const { adapters } = createHostedAdapters();
  return {
    ...defaultHostedHandlerBoundary(),
    request: (input) => requestHostedReview(input, { adapters }),
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
  const { observers } = createHostedAdapters();
  return {
    ...defaultHostedHandlerBoundary(),
    awaitResult: (input) => awaitHostedReview(input, {
      observers,
      clock: {
        now: () => Date.now(),
        sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      },
    }),
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
  return {
    ...defaultHostedHandlerBoundary(),
    settle: (input) => settleHostedFinding(input, { port }),
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
