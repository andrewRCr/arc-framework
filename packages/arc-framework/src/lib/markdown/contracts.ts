/** Narrow operation contracts and shared diagnostics for repository Markdown tooling. */

import { Buffer } from "node:buffer";

import { UserFacingError } from "../errors.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { validateMarkdownPath, type MarkdownPathIdentity } from "./authority.js";

/** Explicit worktree formatter input. */
export interface ExplicitMarkdownFormatInput {
  readonly operation: "format-explicit";
  readonly paths: readonly ManagedPath[];
}

/** Complete selected-scope worktree lint input. */
export interface WorktreeMarkdownLintInput {
  readonly operation: "lint-worktree";
  readonly paths: readonly ManagedPath[];
}

/** Complete selected-scope staged snapshot lint input. */
export interface StagedMarkdownLintInput {
  readonly operation: "lint-index";
  readonly paths: readonly ManagedPath[];
}

export type MarkdownOperationInput =
  | ExplicitMarkdownFormatInput
  | WorktreeMarkdownLintInput
  | StagedMarkdownLintInput;

export type MarkdownOperation = MarkdownOperationInput["operation"];

/** One exact next command owned by the operation that can resolve a finding. */
export interface MarkdownRemedy {
  readonly command: string;
}

/** Shared file-specific diagnostic record retained by every operation result. */
export interface MarkdownDiagnostic {
  readonly operation: MarkdownOperation;
  readonly path: ManagedPath;
  readonly code: `markdown.${Lowercase<string>}`;
  readonly message: string;
  readonly remedy?: MarkdownRemedy;
}

/** Inputs for a stable Markdown diagnostic. */
export interface CreateMarkdownDiagnosticOptions {
  readonly operation: MarkdownOperation;
  readonly path: string;
  readonly code: `markdown.${Lowercase<string>}`;
  readonly message: string;
  readonly remedyPath?: string;
}

/** Inputs for adapting an operation loader failure to the shared CLI boundary. */
export interface AdaptMarkdownOperationErrorOptions {
  readonly operation: MarkdownOperation;
  readonly path: string;
  readonly error: unknown;
  readonly diagnostic?: MarkdownDiagnostic;
}

/** Byte range changed by an explicit formatter. */
export interface MarkdownChangedRange {
  readonly start: number;
  readonly end: number;
}

/** Per-file formatter outcome before aggregation. */
export interface ExplicitMarkdownFormatFileInput {
  readonly identity: MarkdownPathIdentity;
  readonly status: "unchanged" | "changed" | "refused";
  readonly changedRanges: readonly MarkdownChangedRange[];
  readonly write: "unchanged" | "written" | "not-written";
}

/** Explicit formatter result; changed ranges and partial writes stay formatter-only. */
export interface ExplicitMarkdownFormatResult {
  readonly operation: "format-explicit";
  readonly writeStatus: "none" | "complete" | "partial";
  readonly files: readonly (ExplicitMarkdownFormatFileInput & { readonly path: ManagedPath })[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

/** Per-file worktree lint outcome. */
export interface WorktreeMarkdownLintFileInput {
  readonly identity: MarkdownPathIdentity;
  readonly status: "clean" | "invalid" | "unreadable";
}

/** Per-file staged-snapshot lint outcome. */
export interface StagedMarkdownLintFileInput {
  readonly identity: MarkdownPathIdentity;
  readonly status: "clean" | "invalid" | "unreadable";
}

/** Worktree lint result with no write or changed-range variants. */
export interface WorktreeMarkdownLintResult {
  readonly operation: "lint-worktree";
  readonly verdict: "pass" | "fail";
  readonly files: readonly (WorktreeMarkdownLintFileInput & { readonly path: ManagedPath })[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

/** Staged-snapshot lint result with no worktree-write variants. */
export interface StagedMarkdownLintResult {
  readonly operation: "lint-index";
  readonly verdict: "pass" | "fail";
  readonly files: readonly (StagedMarkdownLintFileInput & { readonly path: ManagedPath })[];
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

/** Build one discriminated operation input without widening its result type. */
export function createMarkdownOperationInput(
  operation: "format-explicit",
  paths: readonly string[],
): ExplicitMarkdownFormatInput;
export function createMarkdownOperationInput(
  operation: "lint-worktree",
  paths: readonly string[],
): WorktreeMarkdownLintInput;
export function createMarkdownOperationInput(
  operation: "lint-index",
  paths: readonly string[],
): StagedMarkdownLintInput;
export function createMarkdownOperationInput(
  operation: MarkdownOperation,
  paths: readonly string[],
): MarkdownOperationInput {
  return { operation, paths: paths.map(validateMarkdownPath) };
}

function shellQuote(path: ManagedPath): string {
  return `'${path.replaceAll("'", `'\\''`)}'`;
}

function diagnosticRemedy(options: CreateMarkdownDiagnosticOptions, path: ManagedPath): MarkdownRemedy | undefined {
  switch (options.code) {
    case "markdown.table-alignment":
    case "markdown.meta-normalization":
      return { command: `npm run format:tables -- ${shellQuote(path)}` };
    case "markdown.wrong-direction":
      return options.remedyPath === undefined
        ? undefined
        : { command: `npm run format:tables -- ${shellQuote(validateMarkdownPath(options.remedyPath))}` };
    case "markdown.framework-projection":
      return options.remedyPath === undefined
        ? undefined
        : { command: `npm run render:framework -- ${shellQuote(validateMarkdownPath(options.remedyPath))}` };
    case "markdown.derived-readiness":
      return { command: "npx arc status --project --staged > .arc/backlog/ROADMAP.md" };
    default:
      return undefined;
  }
}

/** Create one path-preserving diagnostic with centrally owned remediation. */
export function createMarkdownDiagnostic(options: CreateMarkdownDiagnosticOptions): MarkdownDiagnostic {
  const path = validateMarkdownPath(options.path);
  const remedy = diagnosticRemedy(options, path);
  return {
    operation: options.operation,
    path,
    code: options.code,
    message: options.message,
    ...(remedy === undefined ? {} : { remedy }),
  };
}

/** Create the shared refusal/reroute diagnostic for an authority-owned path. */
export function createMarkdownRouteDiagnostic(
  operation: MarkdownOperation,
  identity: MarkdownPathIdentity,
): MarkdownDiagnostic | undefined {
  switch (identity.kind) {
    case "rendered-framework":
      return createMarkdownDiagnostic({
        operation,
        path: identity.path,
        code: "markdown.wrong-direction",
        message: "Rendered Framework Markdown must be changed through its package source",
        remedyPath: identity.counterpart,
      });
    case "derived-readiness":
      return createMarkdownDiagnostic({
        operation,
        path: identity.path,
        code: "markdown.derived-readiness",
        message: "Derived readiness Markdown must be regenerated",
      });
    case "managed-meta":
      return createMarkdownDiagnostic({
        operation,
        path: identity.path,
        code: "markdown.meta-normalization",
        message: "Managed meta Markdown must use its content-preserving normalizer",
      });
    case "excluded":
      return createMarkdownDiagnostic({
        operation,
        path: identity.path,
        code: "markdown.authority-refusal",
        message: "This Markdown surface is outside the selected operation scope",
      });
    case "package-framework":
    case "package-configurable":
    case "package-scaffold":
    case "project-configurable":
    case "project-owned":
      return undefined;
  }
}

/** Stable path/code/message ordering for multi-file diagnostic aggregation. */
export function aggregateMarkdownDiagnostics(
  diagnostics: readonly MarkdownDiagnostic[],
): readonly MarkdownDiagnostic[] {
  return [...diagnostics].sort((left, right) =>
    Buffer.compare(Buffer.from(left.path), Buffer.from(right.path))
    || Buffer.compare(Buffer.from(left.code), Buffer.from(right.code))
    || Buffer.compare(Buffer.from(left.message), Buffer.from(right.message)));
}

/** Aggregate explicit formatter files while retaining every per-path outcome. */
export function completeExplicitMarkdownFormat(
  files: readonly ExplicitMarkdownFormatFileInput[],
  diagnostics: readonly MarkdownDiagnostic[],
): ExplicitMarkdownFormatResult {
  const written = files.filter(({ write }) => write === "written").length;
  const notWritten = files.filter(({ write }) => write === "not-written").length;
  return {
    operation: "format-explicit",
    writeStatus: written === 0 ? "none" : notWritten === 0 ? "complete" : "partial",
    files: files.map((file) => ({ ...file, path: file.identity.path })),
    diagnostics: aggregateMarkdownDiagnostics(diagnostics),
  };
}

/** Aggregate complete selected-scope worktree lint outcomes. */
export function completeWorktreeMarkdownLint(
  files: readonly WorktreeMarkdownLintFileInput[],
  diagnostics: readonly MarkdownDiagnostic[],
): WorktreeMarkdownLintResult {
  return {
    operation: "lint-worktree",
    verdict: files.every(({ status }) => status === "clean") && diagnostics.length === 0 ? "pass" : "fail",
    files: files.map((file) => ({ ...file, path: file.identity.path })),
    diagnostics: aggregateMarkdownDiagnostics(diagnostics),
  };
}

/** Aggregate complete selected-scope staged lint outcomes. */
export function completeStagedMarkdownLint(
  files: readonly StagedMarkdownLintFileInput[],
  diagnostics: readonly MarkdownDiagnostic[],
): StagedMarkdownLintResult {
  return {
    operation: "lint-index",
    verdict: files.every(({ status }) => status === "clean") && diagnostics.length === 0 ? "pass" : "fail",
    files: files.map((file) => ({ ...file, path: file.identity.path })),
    diagnostics: aggregateMarkdownDiagnostics(diagnostics),
  };
}

/** Preserve operation and remedy context while adapting failures to {@link UserFacingError}. */
export function adaptMarkdownOperationError(
  options: AdaptMarkdownOperationErrorOptions,
): UserFacingError {
  if (options.error instanceof UserFacingError) return options.error;
  const path = validateMarkdownPath(options.path);
  const code = options.error instanceof ArcError ? options.error.code : "markdown.operation-failed";
  const why = options.error instanceof Error ? options.error.message : "An unknown loader failure occurred";
  const command = options.diagnostic?.remedy?.command;
  return new UserFacingError({
    code,
    whatHappened: `${options.operation} failed for ${path}`,
    why,
    whatToDo: command === undefined
      ? `Inspect the ${options.operation} input at ${path} and retry.`
      : `Run \`${command}\`.`,
  });
}
