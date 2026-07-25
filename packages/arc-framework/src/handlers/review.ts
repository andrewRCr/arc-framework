/** Machine-readable review workflow handlers. */

import { readFile } from "node:fs/promises";
import { ZodError, type ZodType } from "zod";

import { createRawGitExec, gitExec } from "../lib/io-context.js";
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
  type ReviewReadinessRequest,
} from "../scripts/review-gate/readiness.js";
import {
  ReviewUnlockEnvelopeSchema,
  ReviewUnlockRequestSchema,
  unlockReviewHead,
  type ReviewUnlockRequest,
} from "../scripts/review-gate/unlock.js";
import { GhReviewUnlockPort } from "../scripts/review-gate/hosts/github/unlock.js";
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
import { GhHostedReviewPort, hostedGhRunner } from "../scripts/review-gate/hosted/gh-process.js";
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

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
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

function defaultReviewReadinessDependencies(): ReviewReadinessHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    check: (request) => evaluateReviewReadiness(request),
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

export interface ReviewUnlockHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  unlock(request: ReviewUnlockRequest, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultReviewUnlockDependencies(): ReviewUnlockHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    unlock: (request) => unlockReviewHead(
      request,
      new GhReviewUnlockPort(hostedGhRunner, evaluateReviewReadiness),
    ),
  };
}

/**
 * Preflight and dispatch one exact-head clearance request as a JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewUnlock(
  source: string,
  overrides: Partial<ReviewUnlockHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultReviewUnlockDependencies(), ...overrides };
  await executeReviewHandler({
    mode: "review-unlock",
    source,
    requestSchema: ReviewUnlockRequestSchema,
    resultSchema: ReviewUnlockEnvelopeSchema,
    dependencies,
    execute: (request, root) => dependencies.unlock(
      ReviewUnlockRequestSchema.parse(request),
      root,
    ),
  });
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
  mode: ReviewCommandMode;
  source: string;
  requestSchema: ZodType;
  resultSchema: ZodType;
  dependencies: ReviewHandlerBoundary;
  execute(request: unknown, root: string): Promise<unknown>;
}): Promise<void> {
  let root: string;
  try {
    const resolved = input.dependencies.resolveRoot(process.cwd());
    if (resolved === null) throw new Error("Not inside an ARC project.");
    root = resolved;
  } catch (error) {
    emitReviewCommandError(input.mode, error, "execution", input.dependencies);
    return;
  }

  let request: unknown;
  try {
    request = input.requestSchema.parse(JSON.parse(await input.dependencies.readText(input.source)));
  } catch (error) {
    emitReviewCommandError(input.mode, error, "request", input.dependencies);
    return;
  }

  let rawResult: unknown;
  try {
    rawResult = await input.execute(request, root);
  } catch (error) {
    emitReviewCommandError(input.mode, error, "execution", input.dependencies);
    return;
  }

  try {
    const result = input.resultSchema.parse(rawResult);
    input.dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    emitReviewCommandError(input.mode, error, "output", input.dependencies);
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
  let request: unknown;
  try {
    request = input.requestSchema.parse(JSON.parse(await input.dependencies.readText(input.source)));
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
  dependencies.write(`${JSON.stringify(reviewCommandError(mode, error, phase))}\n`);
  dependencies.setExitCode(1);
}

function emitReviewCommandError(
  mode: ReviewCommandMode,
  error: unknown,
  phase: ReviewHandlerErrorPhase,
  dependencies: Pick<ReviewHandlerBoundary, "write" | "setExitCode">,
): void {
  dependencies.write(`${JSON.stringify(reviewCommandError(mode, error, phase))}\n`);
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

function defaultFrontlineRunDependencies(): ReviewFrontlineRunHandlerDependencies {
  return {
    ...defaultReviewHandlerBoundary(),
    run: (request, root) => runFrontlineReviewCommand(
      request,
      createFrontlineRunDependencies({ exec: gitExec, cwd: root }),
    ),
  };
}

/**
 * Execute one exact-target frontline review and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param overrides - Test-only handler boundary overrides.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewFrontlineRun(
  source: string,
  overrides: Partial<ReviewFrontlineRunHandlerDependencies> = {},
): Promise<void> {
  const dependencies = { ...defaultFrontlineRunDependencies(), ...overrides };
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
  mode: ReviewCommandMode,
  error: unknown,
  phase: ReviewHandlerErrorPhase,
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
  return ReviewCommandErrorEnvelopeSchema.parse({
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
