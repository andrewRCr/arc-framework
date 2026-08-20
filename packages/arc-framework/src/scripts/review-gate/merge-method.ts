/** Configured merge-method validation against live repository policy. */

import { canonicalDigest } from "../../lib/kernel/canonical/canonical-json.js";
import { z } from "zod";
import {
  SpineRemedySchema,
  spineRemedy,
  type SpineRemedy,
} from "../integration/spine-refusal.js";

export const MergeMethodSchema = z.enum(["merge", "rebase", "squash"]);
export type MergeMethod = z.infer<typeof MergeMethodSchema>;

export interface MergeMethodPolicyPort {
  resolveRepository(): Promise<string>;
  readPolicy(repository: string): Promise<Record<MergeMethod, boolean>>;
}

const MergeMethodResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-merge-method-resolve"),
  repository: z.string().trim().min(1).nullable(),
};

export const MergeMethodResolveResultSchema = z.union([
  z.strictObject({
    ...MergeMethodResultBaseShape,
    state: z.literal("validated"),
    nextAction: z.literal("use-method"),
    method: MergeMethodSchema,
    allowedMethods: z.array(MergeMethodSchema),
    policyFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  }),
  z.strictObject({
    ...MergeMethodResultBaseShape,
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["method-disallowed", "policy-unreadable"]),
    configuredMethod: MergeMethodSchema.nullable(),
    allowedMethods: z.array(MergeMethodSchema),
    policyFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u).optional(),
    detail: z.string().trim().min(1).optional(),
    remedy: SpineRemedySchema,
  }),
]);
export type MergeMethodResolveResult = z.infer<typeof MergeMethodResolveResultSchema>;

/** Resolve the configured merge method against current host policy. */
export async function resolveMergeMethod(
  configuredMethod: MergeMethod,
  port: MergeMethodPolicyPort,
  expectedRepository?: string,
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
      state: "blocked",
      nextAction: "stop",
      reason: "policy-unreadable",
      configuredMethod,
      allowedMethods: [],
      detail: error instanceof Error ? error.message : String(error),
      remedy: mergeMethodRemedy(),
    };
  }
  const allowedMethods = (["merge", "rebase", "squash"] as const).filter((method) => policy[method]);
  const policyFingerprint = canonicalDigest({ repository, allowedMethods });
  if (!allowedMethods.includes(configuredMethod)) {
    return {
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository,
      state: "blocked",
      nextAction: "stop",
      reason: "method-disallowed",
      configuredMethod,
      allowedMethods,
      policyFingerprint,
      remedy: mergeMethodRemedy(),
    };
  }
  return {
    schemaVersion: 1,
    mode: "review-merge-method-resolve",
    repository,
    state: "validated",
    nextAction: "use-method",
    method: configuredMethod,
    allowedMethods,
    policyFingerprint,
  };
}

function mergeMethodRemedy(): SpineRemedy {
  return spineRemedy(
    "The configured merge method must match readable repository policy.",
    "Align merge.strategy with repository policy, then re-run",
    ["arc", "review", "merge-method", "resolve", "--json"],
  );
}
