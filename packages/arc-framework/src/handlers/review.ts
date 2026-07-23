/** Machine-readable review workflow handlers. */

import { readFile } from "node:fs/promises";

import { gitExec } from "../lib/io-context.js";
import { resolveArcRoot } from "../lib/paths.js";
import { createLocalFrontlineSourcePreferenceReader } from "../scripts/review-gate/hosts/local/frontline-source-preferences.js";
import { resolveFrontlineCommand } from "../scripts/review-gate/policy/frontline-command.js";
import { FrontlineSourceRegistry } from "../scripts/review-gate/policy/frontline-source.js";
import { CODERABBIT_FRONTLINE_REGISTRATION } from "../scripts/review-gate/providers/coderabbit/frontline-execution.js";
import {
  requestHostedReview,
  type HostedReviewAdapter,
} from "../scripts/review-gate/hosted/request.js";
import {
  awaitHostedReview,
  type HostedReviewObserver,
} from "../scripts/review-gate/hosted/await.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonSource(source: string): Promise<unknown> {
  const text = source === "-" ? await readStdin() : await readFile(source, "utf8");
  return JSON.parse(text) as unknown;
}

function emitReviewError(mode: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode,
    error: { code: "invalid-request", message },
  })}\n`);
  process.exitCode = 1;
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
    const request = await readJsonSource(source);
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
    emitReviewError("review-frontline-resolve", error);
  }
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
  dependencies: { adapters: readonly HostedReviewAdapter[] } = { adapters: [] },
): Promise<void> {
  try {
    const request = await readJsonSource(source);
    const result = await requestHostedReview(request, dependencies);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    emitReviewError("review-hosted-request", error);
  }
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
  dependencies: { observers: readonly HostedReviewObserver[] } = { observers: [] },
): Promise<void> {
  try {
    const request = await readJsonSource(source);
    const result = await awaitHostedReview(request, {
      ...dependencies,
      clock: {
        now: () => Date.now(),
        sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      },
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    emitReviewError("review-hosted-await", error);
  }
}
