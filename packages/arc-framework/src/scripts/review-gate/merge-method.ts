/** Configured merge-method validation against live repository policy. */

import { canonicalDigest } from "../../lib/kernel/canonical/canonical-json.js";
import { z } from "zod";
import { CanonicalDigestSchema } from "../../lib/kernel/schema/vocabulary.js";
import {
  SpineRemedySchema,
  spineRemedy,
  type SpineRemedy,
} from "../integration/spine-refusal.js";

export const MergeMethodSchema = z.enum(["merge", "rebase", "squash"]);
export type MergeMethod = z.infer<typeof MergeMethodSchema>;
export const MergeMethodStackPositionSchema = z.enum(["non-delivery", "intermediate", "top"]);
export type MergeMethodStackPosition = z.infer<typeof MergeMethodStackPositionSchema>;

export interface MergeMethodPolicyPort {
  resolveRepository(): Promise<string>;
  readPolicy(repository: string): Promise<Record<MergeMethod, boolean>>;
}

/**
 * Compose the canonical command that re-runs merge-method resolution for one stack position.
 *
 * @param stackPosition - Delivery position retained by the retry.
 * @returns Argument vector for the public merge-method resolver.
 */
export function mergeMethodResolveArgv(stackPosition: MergeMethodStackPosition): string[] {
  return stackPosition === "non-delivery"
    ? ["arc", "review", "merge-method", "resolve"]
    : [
        "arc",
        "review",
        "merge-method",
        "resolve",
        "--stack-position",
        stackPosition,
      ];
}

const MergeMethodResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-merge-method-resolve"),
  repository: z.string().trim().min(1).nullable(),
  stackPosition: MergeMethodStackPositionSchema,
};

export const MergeMethodResolveResultSchema = z.union([
  z.strictObject({
    ...MergeMethodResultBaseShape,
    state: z.literal("validated"),
    nextAction: z.literal("use-method"),
    method: MergeMethodSchema,
    allowedMethods: z.array(MergeMethodSchema),
    policyFingerprint: CanonicalDigestSchema,
  }),
  z.strictObject({
    ...MergeMethodResultBaseShape,
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["invalid-input", "method-disallowed", "policy-unreadable"]),
    configuredMethod: MergeMethodSchema.nullable(),
    allowedMethods: z.array(MergeMethodSchema),
    policyFingerprint: CanonicalDigestSchema.optional(),
    detail: z.string().trim().min(1).optional(),
    remedy: SpineRemedySchema,
  }),
]);
export type MergeMethodResolveResult = z.infer<typeof MergeMethodResolveResultSchema>;

/**
 * Resolve the configured merge method against current host policy and stack position.
 *
 * @param configuredMethod - Project merge strategy.
 * @param port - Repository and live host-policy boundary.
 * @param expectedRepository - Optional caller-pinned repository coordinates.
 * @param stackPosition - Delivery position that constrains the effective method.
 * @returns A validated effective method with a position-bound policy fingerprint, or a closed refusal.
 */
export async function resolveMergeMethod(
  configuredMethod: MergeMethod,
  port: MergeMethodPolicyPort,
  expectedRepository?: string,
  stackPosition: MergeMethodStackPosition = "non-delivery",
): Promise<MergeMethodResolveResult> {
  let repository: string | null = null;
  let policy: Record<MergeMethod, boolean>;
  try {
    repository = expectedRepository ?? await port.resolveRepository();
    policy = await port.readPolicy(repository);
  } catch (error) {
    return {
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository,
      stackPosition,
      state: "blocked",
      nextAction: "stop",
      reason: "policy-unreadable",
      configuredMethod,
      allowedMethods: [],
      detail: error instanceof Error ? error.message : String(error),
      remedy: mergeMethodRemedy(stackPosition),
    };
  }
  const allowedMethods = (["merge", "rebase", "squash"] as const).filter((method) => policy[method]);
  const method = stackPosition === "intermediate" ? "merge" : configuredMethod;
  const policyFingerprint = canonicalDigest({ repository, allowedMethods, stackPosition });
  if (!allowedMethods.includes(method)) {
    return {
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository,
      stackPosition,
      state: "blocked",
      nextAction: "stop",
      reason: "method-disallowed",
      configuredMethod,
      allowedMethods,
      policyFingerprint,
      ...(stackPosition === "intermediate"
        ? { detail: "Intermediate stack members require merge commits." }
        : {}),
      remedy: mergeMethodRemedy(stackPosition),
    };
  }
  return {
    schemaVersion: 1,
    mode: "review-merge-method-resolve",
    repository,
    stackPosition,
    state: "validated",
    nextAction: "use-method",
    method,
    allowedMethods,
    policyFingerprint,
  };
}

function mergeMethodRemedy(stackPosition: MergeMethodStackPosition): SpineRemedy {
  return spineRemedy(
    "The configured merge method must match readable repository policy.",
    "Align merge.strategy with repository policy, then re-run",
    mergeMethodResolveArgv(stackPosition),
  );
}
