/**
 * Typed command-input acquisition outcomes and authority-aware confirmation gates.
 */

import { z } from "zod";

import { ArcError } from "../kernel/index.js";
import type { InteractionContext } from "./interaction-context.js";

/** Stable provenance for one successfully acquired value. */
export type InputSource = "argument" | "stdin" | "prompt" | "derived" | "default";

/** One unavailable input and every accepted way to supply it. */
export interface InputRequirement {
  readonly name: string;
  readonly acceptedSyntax: readonly string[];
}

/** One schema-path validation issue safe for user-facing diagnostics. */
export interface InputIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** Closed acquisition result; only `resolved` carries mutation authority. */
export type InputResolution<T> =
  | { readonly kind: "resolved"; readonly value: T; readonly source: InputSource }
  | { readonly kind: "cancelled" }
  | { readonly kind: "unavailable"; readonly missing: readonly InputRequirement[] }
  | { readonly kind: "invalid"; readonly issues: readonly InputIssue[] };

/** Raw acquisition presented to the shared schema boundary. */
export type InputCandidate =
  | { readonly kind: "value"; readonly value: unknown; readonly source: InputSource }
  | { readonly kind: "cancelled" }
  | { readonly kind: "missing"; readonly requirement: InputRequirement };

/** Stable command-input failure variants. */
export type CommandInputErrorCode =
  | "command-input.invalid"
  | "command-input.unavailable"
  | "command-input.cancelled"
  | "command-input.unexpected";

/** Command-input boundary failure with a locally exhaustive code contract. */
export class CommandInputError extends ArcError {
  override readonly code: CommandInputErrorCode;

  constructor(message: string, code: CommandInputErrorCode, options?: ErrorOptions) {
    super(message, code, options);
    this.name = "CommandInputError";
    this.code = code;
  }
}

/**
 * Parse one acquired value after cancellation and availability have resolved.
 *
 * @param schema - Command-owned runtime schema.
 * @param candidate - Value, cancellation, or missing requirement.
 * @returns Typed acquisition result.
 */
export function resolveInputValue<T extends z.ZodType>(
  schema: T,
  candidate: InputCandidate,
): InputResolution<z.output<T>> {
  if (candidate.kind === "cancelled") return { kind: "cancelled" };
  if (candidate.kind === "missing") return { kind: "unavailable", missing: [candidate.requirement] };
  const parsed = schema.safeParse(candidate.value);
  if (!parsed.success) {
    return {
      kind: "invalid",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    };
  }
  return { kind: "resolved", value: parsed.data, source: candidate.source };
}

/** Resolve a prompt answer while preventing cancellation symbols from reaching schemas. */
export function resolvePromptInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
): InputResolution<z.output<T>> {
  return resolveInputValue(schema, typeof value === "symbol"
    ? { kind: "cancelled" }
    : { kind: "value", value, source: "prompt" });
}

/**
 * Resolve one value by explicit precedence without inventing an undeclared default.
 *
 * @param schema - Command-owned field schema.
 * @param input - Available acquisition candidates and required-input guidance.
 * @returns The first available value parsed through the shared schema boundary.
 */
export function acquireInputValue<T extends z.ZodType>(
  schema: T,
  input: {
    readonly supplied?: { readonly value: unknown };
    readonly prompted?: { readonly value: unknown };
    readonly derived?: { readonly value: unknown };
    readonly safeDefault?: { readonly declared: boolean; readonly value: unknown };
    readonly requirement: InputRequirement;
  },
): InputResolution<z.output<T>> {
  if (input.supplied !== undefined) {
    return resolveInputValue(schema, { kind: "value", value: input.supplied.value, source: "argument" });
  }
  if (input.prompted !== undefined) return resolvePromptInput(schema, input.prompted.value);
  if (input.derived !== undefined) {
    return resolveInputValue(schema, { kind: "value", value: input.derived.value, source: "derived" });
  }
  if (input.safeDefault?.declared === true) {
    return resolveInputValue(schema, { kind: "value", value: input.safeDefault.value, source: "default" });
  }
  return { kind: "unavailable", missing: [input.requirement] };
}

/** Return one unavailable outcome containing every independently known requirement. */
export function collectMissingRequirements(
  requirements: readonly InputRequirement[],
): InputResolution<never> {
  return { kind: "unavailable", missing: [...requirements] };
}

/** Confirmation policies whose authority must never be conflated. */
export type ConfirmationKind = "courtesy" | "protected" | "interactive-only" | "evidence";

/**
 * Resolve non-prompt confirmation facts; interactive callers supply the prompt result explicitly.
 *
 * @param kind - Command-owned confirmation strength.
 * @param context - Invocation interaction and authority axes.
 * @param input - Explicit evidence or completed prompt result.
 * @returns A resolved affirmative or a typed stop/refusal.
 */
export function resolveConfirmation(
  kind: ConfirmationKind,
  context: Pick<InteractionContext, "interaction" | "confirmation">,
  input: { readonly explicit?: boolean; readonly prompted?: boolean | "cancelled" } = {},
): InputResolution<boolean> {
  if (input.prompted === "cancelled") return { kind: "cancelled" };
  if (kind === "evidence") {
    return input.explicit === true || input.prompted === true
      ? { kind: "resolved", value: true, source: input.explicit === true ? "argument" : "prompt" }
      : collectMissingRequirements([{ name: "evidence", acceptedSyntax: [] }]);
  }
  if (kind === "interactive-only") {
    if (context.interaction !== "allowed") {
      return collectMissingRequirements([{ name: "interactive approval", acceptedSyntax: [] }]);
    }
    return input.prompted === true
      ? { kind: "resolved", value: true, source: "prompt" }
      : input.prompted === false ? { kind: "cancelled" } : collectMissingRequirements([
        { name: "interactive approval", acceptedSyntax: [] },
      ]);
  }
  if (kind === "protected") {
    if (context.confirmation === "accept") return { kind: "resolved", value: true, source: "argument" };
    if (context.interaction !== "allowed") {
      return collectMissingRequirements([{ name: "confirmation", acceptedSyntax: ["--yes"] }]);
    }
    return input.prompted === true
      ? { kind: "resolved", value: true, source: "prompt" }
      : input.prompted === false ? { kind: "cancelled" } : collectMissingRequirements([
        { name: "confirmation", acceptedSyntax: ["--yes"] },
      ]);
  }
  if (context.interaction !== "allowed") return { kind: "resolved", value: true, source: "default" };
  return input.prompted === true
    ? { kind: "resolved", value: true, source: "prompt" }
    : input.prompted === false ? { kind: "cancelled" } : collectMissingRequirements([
      { name: "courtesy confirmation", acceptedSyntax: [] },
    ]);
}

/** Convert an unknown boundary failure to a safe command-owned error. */
export function adaptCommandInputError(
  value: unknown,
  fallback: { readonly code: CommandInputErrorCode; readonly message: string },
): CommandInputError {
  if (value instanceof CommandInputError) return value;
  return value instanceof Error
    ? new CommandInputError(fallback.message, fallback.code, { cause: value })
    : new CommandInputError(fallback.message, fallback.code);
}
