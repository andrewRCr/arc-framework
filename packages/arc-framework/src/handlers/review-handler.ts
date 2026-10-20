/** JSON request transport shared by review handlers. */
import { readFile } from "node:fs/promises";
import { z, type ZodType } from "zod";
import { resolveArcRoot } from "../lib/paths.js";
import { ReviewCommandErrorEnvelopeSchema } from "../scripts/review-gate/core/review-command-envelope.js";
import { reviewProjectIdentityRequestRemedy } from "../scripts/review-gate/runtime/project-identity-remedy.js";
import { reviewContinuationRequestError } from "../scripts/review-gate/runtime/continuation-invocation.js";
import type { SpineRemedy } from "../scripts/integration/spine-refusal.js";
import { reviewCommandError, type ReviewFamilyMode, type ReviewHandlerErrorPhase } from "./review-handler-errors.js";
/**
 * Build the request-source operand schema owned by one review command.
 *
 * Each command registers its own instance: the registry keys schemas by identity,
 * so sharing one instance between registered command paths would collide.
 *
 * @returns One review command's request-source operand schema
 */
export function reviewCommandInputSchema(): z.ZodType<{ input: string }> {
  return z.object({
    input: z.string().trim().min(1, "A JSON request file path, or - for stdin, is required."),
  }).strict();
}

/** Request-source operand schema shared by the review handlers' own validation. */
export const ReviewCommandInputSchema = reviewCommandInputSchema();

/** Read the complete standard-input request. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface ReviewHandlerBoundary {
  resolveRoot(cwd: string): string | null;
  readText(source: string): Promise<string>;
  write(text: string): void;
  setExitCode(code: number): void;
}

/** Build the process and filesystem boundaries used by review commands. */
export function defaultReviewHandlerBoundary(): ReviewHandlerBoundary {
  return {
    resolveRoot: resolveArcRoot,
    readText: async (source) => source === "-" ? readStdin() : readFile(source, "utf8"),
    write: (text) => process.stdout.write(text),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  };
}

/** Validate one request, execute it, and emit one validated JSON envelope. */
export async function executeReviewHandler(input: {
  mode: ReviewFamilyMode;
  source: string;
  requestSchema: ZodType;
  resultSchema: ZodType;
  /** Error envelope owning `input.mode`; the review family's own by default. */
  errorSchema?: ZodType;
  dependencies: ReviewHandlerBoundary;
  execute(request: unknown, root: string): Promise<unknown>;
  /** Corrective continuation for an execution refusal, given the request exactly as submitted. */
  remedyFor?(error: unknown, submittedRequest: unknown): SpineRemedy | undefined;
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

  let submittedRequest: unknown;
  let request: unknown;
  try {
    submittedRequest = JSON.parse(await input.dependencies.readText(operand.data.input));
    request = input.requestSchema.parse(submittedRequest);
  } catch (error) {
    emitReviewCommandError(input.mode, error, "request", input.dependencies, errorSchema);
    return;
  }

  let rawResult: unknown;
  try {
    rawResult = await input.execute(request, root);
  } catch (error) {
    const remedy = reviewProjectIdentityRequestRemedy(input.mode, error, submittedRequest)
      ?? input.remedyFor?.(error, submittedRequest);
    emitReviewCommandError(input.mode, error, "execution", input.dependencies, errorSchema, remedy);
    return;
  }

  try {
    const result = input.resultSchema.parse(rawResult);
    input.dependencies.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    emitReviewCommandError(input.mode, error, "output", input.dependencies, errorSchema);
  }
}

function emitReviewCommandError(
  mode: ReviewFamilyMode,
  error: unknown,
  phase: ReviewHandlerErrorPhase,
  dependencies: Pick<ReviewHandlerBoundary, "write" | "setExitCode">,
  errorSchema: ZodType,
  remedy?: SpineRemedy,
): void {
  const remedyFor = remedy === undefined ? undefined : () => remedy;
  const requestError = reviewContinuationRequestError(mode, error, phase === "request");
  dependencies.write(`${JSON.stringify(reviewCommandError(mode, requestError, phase, errorSchema, remedyFor))}\n`);
  dependencies.setExitCode(1);
}
