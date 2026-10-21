/** Git reads shared by the producers that derive D4 contribution facts for an applicability classifier. */

import { z } from "zod";

import {
  DeliveryContributionCoordinateSchema,
  DeliveryContributionEndpointsSchema,
  type DeliveryContributionCoordinate,
  type DeliveryContributionEndpoints,
  type DeliveryContributionProofResult,
} from "../delivery/contribution-proof.js";
import { proveGitDeliveryContribution } from "../delivery/git-contribution-proof.js";
import type { RawGitExec } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";

const decoder = new TextDecoder("utf-8", { fatal: true });

/** Git answered, but with output that is not the evidence the read asked for. */
export class MalformedGitEvidenceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "MalformedGitEvidenceError";
  }
}

function decodeEvidence(bytes: Uint8Array, description: string): string {
  try {
    return decoder.decode(bytes);
  } catch (error) {
    throw new MalformedGitEvidenceError(`${description} is not valid UTF-8.`, error);
  }
}

/** Decode Git's line-oriented output, reading empty output as no lines. */
export function decodeGitLines(bytes: Uint8Array): string[] {
  const value = decodeEvidence(bytes, "Git line evidence").trim();
  return value === "" ? [] : value.split(/\r?\n/u);
}

/** Resolve one exact commit and its tree, refusing a commit Git resolves to anything else. */
export async function readContributionCoordinate(
  exec: RawGitExec,
  head: string,
): Promise<DeliveryContributionCoordinate> {
  const [commitResult, treeResult] = await Promise.all([
    exec(["rev-parse", "--verify", `${head}^{commit}`], { objectAccess: "local-only" }),
    exec(["rev-parse", `${head}^{tree}`], { objectAccess: "local-only" }),
  ]);
  const commit = decodeEvidence(commitResult.stdout, "Git commit evidence").trim();
  const tree = decodeEvidence(treeResult.stdout, "Git tree evidence").trim();
  if (commit !== head) throw new MalformedGitEvidenceError(`Git did not resolve the exact commit ${head}.`);
  return DeliveryContributionCoordinateSchema.parse({ head, tree });
}

/**
 * Read every best common ancestor of two revisions.
 *
 * A pair with none reports none rather than raising: having no ancestor is an answer about the pair, which
 * the caller states in its own words, and it reaches this reader as two different Git outcomes.
 *
 * @returns Every ancestor the pair has, or nothing when it has none.
 */
export async function readMergeBases(
  exec: RawGitExec,
  revision: string,
  other: string,
): Promise<readonly string[] | null> {
  const args = ["merge-base", "--all", revision, other];
  let result;
  try {
    result = await exec(args, { objectAccess: "local-only" });
  } catch (error) {
    const rejected = normalizeGitRejection(error, { command: "git", args });
    if (rejected.kind === "nonzero-exit" && rejected.exitCode === 1 && rejected.stdout === "") return null;
    throw rejected;
  }
  const mergeBases = decodeGitLines(result.stdout);
  return mergeBases.length === 0 ? null : mergeBases;
}

/** The four revisions a contribution comparison reads, before resolution to exact coordinates. */
export interface ContributionRevisions {
  readonly beforeBase: string;
  readonly beforeMember: string;
  readonly afterBase: string;
  readonly afterMember: string;
}

/** Resolve the four revisions to exact coordinates and prove the after contribution against the before one. */
export async function proveContributionFacts(
  exec: RawGitExec,
  revisions: ContributionRevisions,
): Promise<{ endpoints: DeliveryContributionEndpoints; proof: DeliveryContributionProofResult }> {
  const [beforeBase, beforeMember, afterBase, afterMember] = await Promise.all([
    readContributionCoordinate(exec, revisions.beforeBase),
    readContributionCoordinate(exec, revisions.beforeMember),
    readContributionCoordinate(exec, revisions.afterBase),
    readContributionCoordinate(exec, revisions.afterMember),
  ]);
  const endpoints = DeliveryContributionEndpointsSchema.parse({
    before: { predecessor: beforeBase, member: beforeMember },
    after: { predecessor: afterBase, member: afterMember },
  });
  return { endpoints, proof: await proveGitDeliveryContribution({ exec, ...endpoints }) };
}

/** Name why a contribution read failed: evidence that did not parse, or Git itself failing. */
export function contributionReadFailure(error: unknown): {
  reason: "malformed-evidence" | "git-failure";
  detail: string;
} {
  return {
    reason: error instanceof z.ZodError || error instanceof MalformedGitEvidenceError
      ? "malformed-evidence"
      : "git-failure",
    detail: error instanceof Error ? error.message : String(error),
  };
}
