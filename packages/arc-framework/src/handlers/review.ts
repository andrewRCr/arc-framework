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
  requestHostedReview,
  type HostedReviewAdapter,
} from "../scripts/review-gate/hosted/request.js";
import {
  HostedAwaitEnvelopeSchema,
  awaitHostedReview,
  type HostedReviewObserver,
} from "../scripts/review-gate/hosted/await.js";
import {
  HostedSettleEnvelopeSchema,
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

export interface ReviewResolveHandlerDependencies {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  resolve(request: ReviewPolicyCommandRequest, root: string): Promise<unknown>;
  write(text: string): void;
  setExitCode(code: number): void;
}

function defaultReviewResolveDependencies(): ReviewResolveHandlerDependencies {
  return {
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    resolve: resolveConfiguredReviewPolicy,
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  };
}

async function resolveConfiguredReviewPolicy(
  request: ReviewPolicyCommandRequest,
  root: string,
): Promise<unknown> {
  const { settings } = await readConfigSettings(root);
  let sources = request.sources;
  if (sources === undefined && request.lane === "frontline") {
    const preferences = createLocalFrontlineSourcePreferenceReader({
      cwd: root,
      exec: gitExec,
      readFile: (path) => readFile(path, "utf8"),
    });
    const developerSources = await preferences.readDeveloperSourceIds();
    sources = developerSources.length > 0
      ? developerSources
      : parseReviewSourceIds(settings["review.frontline_sources"]);
  }
  sources ??= parseReviewSourceIds(settings["review.standard_sources"]);
  const maxPasses = request.maxPasses ?? Number(
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    check: (request) => evaluateReviewReadiness(request),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    unlock: (request) => unlockReviewHead(
      request,
      new GhReviewUnlockPort(hostedGhRunner, evaluateReviewReadiness),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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

interface ReviewHandlerBoundary {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  write(text: string): void;
  setExitCode(code: number): void;
}

type HostedReviewHandlerMode =
  | "review-hosted-request"
  | "review-hosted-await"
  | "review-hosted-settle";

interface HostedReviewHandlerBoundary {
  readText(source: string): Promise<string>;
  write(text: string): void;
  setExitCode(code: number): void;
}

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

  try {
    const result = await input.execute(request);
    input.dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    emitHostedReviewError(input.mode, error, "execution", input.dependencies);
  }
}

function emitHostedReviewError(
  mode: HostedReviewHandlerMode,
  error: unknown,
  phase: Exclude<ReviewHandlerErrorPhase, "output">,
  dependencies: Pick<HostedReviewHandlerBoundary, "write" | "setExitCode">,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const code = phase === "request" && (error instanceof ZodError || error instanceof SyntaxError)
    ? "invalid-input"
    : "unexpected-failure";
  dependencies.write(`${JSON.stringify({
    schemaVersion: 1,
    mode,
    diagnostics: [],
    error: { code, message },
  })}\n`);
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
  return {
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    resolve: (request, root) => resolveFrontlineCommand(request, {
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: root,
        exec: gitExec,
        readFile: (path) => readFile(path, "utf8"),
      }),
      registry: new FrontlineSourceRegistry([CODERABBIT_FRONTLINE_REGISTRATION]),
    }),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    resolve: (request, root) => resolveReviewChunkingCommand(request, {
      readSettings: () => readConfigSettings(root),
      exec: createRawGitExec(root),
    }),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
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

function defaultFrontlineRunDependencies(): ReviewFrontlineRunHandlerDependencies {
  return {
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    run: (request, root) => runFrontlineReviewCommand(
      request,
      createFrontlineRunDependencies({ exec: gitExec, cwd: root }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    prepare: (request, root) => prepareLocalReview(
      request,
      createLocalPrepareDependencies({ exec: gitExec, cwd: root }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    attest: (request, root) => attestLocalReviewCommand(
      request,
      createLocalAttestDependencies({ exec: gitExec, cwd: root }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    resume: (request, root) => resumeLocalReviewCommand(
      request,
      createLocalResumeDependencies({ exec: gitExec, cwd: root }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    respond: (request, root) => respondToReviewCommand(
      request,
      createRespondDependencies({ exec: gitExec, cwd: root }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    reduce: (request, root) => reduceReviewCommand(
      request,
      createReduceDependencies({ exec: gitExec, cwd: root }),
    ),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
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
 * @param dependencies - Built-in hosted adapters supplied by the CLI composition root.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewHostedRequest(
  source: string,
  dependencies: { adapters: readonly HostedReviewAdapter[] } = createHostedAdapters(),
): Promise<void> {
  await executeHostedReviewHandler({
    mode: "review-hosted-request",
    source,
    requestSchema: HostedRequestEnvelopeSchema,
    dependencies: defaultHostedHandlerBoundary(),
    execute: (request) => requestHostedReview(request, dependencies),
  });
}

/**
 * Await one already-requested hosted review and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param dependencies - Built-in observers supplied by the CLI composition root.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewHostedAwait(
  source: string,
  dependencies: { observers: readonly HostedReviewObserver[] } = createHostedAdapters(),
): Promise<void> {
  await executeHostedReviewHandler({
    mode: "review-hosted-await",
    source,
    requestSchema: HostedAwaitEnvelopeSchema,
    dependencies: defaultHostedHandlerBoundary(),
    execute: (request) => awaitHostedReview(request, {
      ...dependencies,
      clock: {
        now: () => Date.now(),
        sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      },
    }),
  });
}

/**
 * Settle one hosted finding and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @param dependencies - Developer-authenticated GitHub mutation port.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewHostedSettle(
  source: string,
  dependencies: { port: HostedSettlementPort } = createHostedAdapters(),
): Promise<void> {
  await executeHostedReviewHandler({
    mode: "review-hosted-settle",
    source,
    requestSchema: HostedSettleEnvelopeSchema,
    dependencies: defaultHostedHandlerBoundary(),
    execute: (request) => settleHostedFinding(request, dependencies),
  });
}
