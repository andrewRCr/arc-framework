/** Configured merge-method validation against live repository policy. */

import { canonicalDigest } from "../../lib/kernel/canonical/canonical-json.js";
import { z } from "zod";
import { spineRemedy, type SpineRemedy } from "../integration/spine-refusal.js";

export const MergeMethodSchema = z.enum(["merge", "rebase", "squash"]);
export type MergeMethod = z.infer<typeof MergeMethodSchema>;

export interface MergeMethodPolicyPort {
  resolveRepository(): Promise<string>;
  readPolicy(repository: string): Promise<Record<MergeMethod, boolean>>;
}

interface MergeMethodResultBase {
  schemaVersion: 1;
  mode: "review-merge-method-resolve";
  repository: string | null;
}

export type MergeMethodResolveResult = MergeMethodResultBase & (
  | {
      state: "validated";
      nextAction: "use-method";
      method: MergeMethod;
      allowedMethods: MergeMethod[];
      policyFingerprint: `sha256:${string}`;
    }
  | {
      state: "blocked";
      nextAction: "stop";
      reason: "method-disallowed" | "policy-unreadable";
      configuredMethod: MergeMethod;
      allowedMethods: MergeMethod[];
      policyFingerprint?: `sha256:${string}`;
      detail?: string;
      remedy: SpineRemedy;
    }
);

/** Resolve the configured merge method against current host policy. */
export async function resolveMergeMethod(
  configuredMethod: MergeMethod,
  port: MergeMethodPolicyPort,
): Promise<MergeMethodResolveResult> {
  let repository: string | null = null;
  let policy: Record<MergeMethod, boolean>;
  try {
    repository = await port.resolveRepository();
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
