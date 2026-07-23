/** Machine-readable review workflow handlers. */

import { readFile } from "node:fs/promises";
import { ZodError } from "zod";

import { gitExec } from "../lib/io-context.js";
import { resolveArcRoot } from "../lib/paths.js";
import {
  LocalPrepareEnvelopeSchema,
  ReviewCommandErrorEnvelopeSchema,
} from "../scripts/review-gate/core/review-command-envelope.js";
import { createLocalFrontlineSourcePreferenceReader } from "../scripts/review-gate/hosts/local/frontline-source-preferences.js";
import {
  LocalTargetDerivationError,
  type LocalTargetInvalidReason,
} from "../scripts/review-gate/hosts/local/repository-target.js";
import { resolveFrontlineCommand } from "../scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../scripts/review-gate/policy/frontline-source.js";
import { CODERABBIT_FRONTLINE_REGISTRATION } from "../scripts/review-gate/providers/coderabbit/frontline-execution.js";
import { createLocalPrepareDependencies } from "../scripts/review-gate/runtime/local-prepare-composition.js";
import { prepareLocalReview } from "../scripts/review-gate/runtime/local-prepare.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Resolve one explicit frontline request and emit exactly one JSON envelope.
 *
 * @param source - JSON request file, or `-` for standard input.
 * @returns Resolves after stdout and exit status are assigned.
 */
export async function handleReviewFrontlineResolve(source: string): Promise<void> {
  try {
    const root = resolveArcRoot(process.cwd());
    if (root === null) throw new Error("Not inside an ARC project.");
    const text = source === "-" ? await readStdin() : await readFile(source, "utf8");
    const request: unknown = JSON.parse(text);
    const result = await resolveFrontlineCommand(request, {
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: root,
        exec: gitExec,
        readFile: (path) => readFile(path, "utf8"),
      }),
      registry: new FrontlineSourceRegistry([CODERABBIT_FRONTLINE_REGISTRATION]),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: "review-frontline-resolve",
      error: { code: "invalid-request", message },
    })}\n`);
    process.exitCode = 1;
  }
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

function reviewCommandError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ZodError || error instanceof SyntaxError
    ? "invalid-input"
    : typeof error === "object"
      && error !== null
      && "code" in error
      && (error.code === "invalid-input" || error.code === "corrupt-state")
        ? error.code
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
    mode: "review-local-prepare",
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
  try {
    const root = dependencies.resolveRoot(process.cwd());
    if (root === null) throw new Error("Not inside an ARC project.");
    const request: unknown = JSON.parse(await dependencies.readText(source));
    const result = LocalPrepareEnvelopeSchema.parse(await dependencies.prepare(request, root));
    dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    dependencies.write(`${JSON.stringify(reviewCommandError(error))}\n`);
    dependencies.setExitCode(1);
  }
}
