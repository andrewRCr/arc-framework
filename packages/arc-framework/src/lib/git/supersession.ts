/**
 * Patch-equal supersession detector — distinguishes local-ahead commits that
 * have been rebased onto the remote (and so are losslessly discardable) from
 * genuinely-divergent local work.
 *
 * The append-only backstop: when a shared branch is rebased and force-pushed
 * elsewhere, the local copy diverges even though its commits survive on the
 * remote as patch-equal equivalents. A generic "manual rebase or merge needed"
 * reconcile understates this — the local commits are superseded, and a
 * `git reset --hard origin/<branch>` recovers cleanly with no lost work. This
 * detector identifies that case so the diverged handler can downgrade its
 * advisory accordingly.
 *
 * Mechanism: `git cherry origin/<branch> HEAD` lists the local-ahead commits
 * (HEAD not in the merge-base with the remote) and marks each by patch-id —
 * `-` when an equivalent exists upstream, `+` when it is novel. Bounded to the
 * local-ahead set by construction; no full-history scan. Read-only and
 * advisory: callers decide how an unexpected local analysis failure is surfaced.
 *
 * @module
 */

import { z } from "zod";
import { RemoteFailureReasonSchema } from "../kernel/index.js";

/** Full local patch-equivalence result. */
export const SupersessionResultSchema = z.strictObject({
  superseded: z.boolean(),
  supersededCommits: z.array(z.string()),
  novelCommits: z.array(z.string()),
});

const UnavailableSupersessionSchema = z.strictObject({
  superseded: z.literal(false),
  supersededCommits: z.tuple([]),
  novelCommits: z.tuple([]),
});

/** Strict snapshot arms; unavailable evidence carries no classified commits. */
export const SupersessionSnapshotAnalysisResultSchema = z.discriminatedUnion("remoteEvidence", [
  z.strictObject({ ...SupersessionResultSchema.shape, remoteEvidence: z.literal("exact") }),
  z.strictObject({ ...UnavailableSupersessionSchema.shape, remoteEvidence: z.literal("pending-fetch") }),
  z.strictObject({
    ...UnavailableSupersessionSchema.shape,
    remoteEvidence: z.literal("unreachable"),
    failureReason: RemoteFailureReasonSchema,
  }),
]);

import type { GitExec } from "./exec.js";
import type { HistoryCompletenessResult } from "./history-completeness.js";
import type { ObjectAvailabilityResult } from "./object-availability.js";
import type { RemoteHeadSnapshotResult } from "./remote-ref-reader.js";

export type SupersessionResult = z.infer<typeof SupersessionResultSchema>;

/** Supersession classified against immutable advertised remote evidence. */
type UnavailableSupersessionResult = z.infer<typeof UnavailableSupersessionSchema>;

export type SupersessionSnapshotAnalysisResult = z.infer<typeof SupersessionSnapshotAnalysisResultSchema>;

export interface DetectSupersessionOptions {
  exec: GitExec;
  /** Current branch; the remote prefix compared against is `origin/<branch>`. */
  branch: string;
}

/** Supplied prerequisites for patch-equivalence analysis against an advertised branch tip. */
export interface AnalyzeSupersessionSnapshotOptions {
  exec: GitExec;
  /** Upstream remote branch name used as the key in `snapshot.tips`. */
  branch: string;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
}

/**
 * Analyze supersession from one immutable advertised snapshot.
 *
 * @param options - Supplied remote evidence, local prerequisites, and Git executor.
 * @returns Exact patch equivalence, incomplete remote evidence, or exact branch absence.
 */
export async function analyzeSupersessionSnapshot(
  options: AnalyzeSupersessionSnapshotOptions,
): Promise<SupersessionSnapshotAnalysisResult> {
  if (options.snapshot.kind === "unreachable") {
    return {
      ...emptySupersessionResult(),
      remoteEvidence: "unreachable",
      failureReason: options.snapshot.failureReason,
    };
  }
  const advertisedOid = options.snapshot.tips[options.branch];
  if (advertisedOid === undefined) {
    return { ...emptySupersessionResult(), remoteEvidence: "exact" };
  }
  if (options.objectAvailability.kind !== "complete") {
    throw new Error("Advertised commit availability could not be inspected.");
  }
  const advertisedCommitIsLocal = options.objectAvailability.commits[advertisedOid];
  if (advertisedCommitIsLocal === false) {
    return { ...emptySupersessionResult(), remoteEvidence: "pending-fetch" };
  }
  if (advertisedCommitIsLocal === undefined) {
    throw new Error("The advertised branch commit has no local availability fact.");
  }
  if (options.history.kind !== "complete") {
    throw new Error("Complete local history is required for supersession analysis.");
  }
  const { stdout } = await options.exec(
    "git",
    ["cherry", advertisedOid, "HEAD"],
    { objectAccess: "local-only" },
  );
  return { ...parseSupersession(stdout), remoteEvidence: "exact" };
}

/** Neutral result when no remote supersession read is needed. */
export function emptySupersessionResult(): UnavailableSupersessionResult {
  return { superseded: false, supersededCommits: [], novelCommits: [] };
}

function parseSupersession(stdout: string): SupersessionResult {
  const supersededCommits: string[] = [];
  const novelCommits: string[] = [];
  const lines = stdout === ""
    ? []
    : (stdout.endsWith("\n") ? stdout.slice(0, -1) : stdout).split("\n");
  for (const line of lines) {
    const match = /^([+-]) ([0-9a-f]{40}|[0-9a-f]{64})$/u.exec(line);
    if (match === null) throw new Error("Malformed git cherry output.");
    const [, sign, oid] = match;
    if (sign === "-") supersededCommits.push(oid as string);
    else novelCommits.push(oid as string);
  }
  return {
    superseded: supersededCommits.length > 0 && novelCommits.length === 0,
    supersededCommits,
    novelCommits,
  };
}

/**
 * Detect whether the local-ahead commit set is patch-equal to a rebased remote
 * prefix.
 *
 * @param options - Git executor and the current branch name.
 * @returns The supersession verdict plus the per-commit superseded/novel split.
 */
export async function detectSupersession(
  options: DetectSupersessionOptions,
): Promise<SupersessionResult> {
  const { exec, branch } = options;

  const { stdout } = await exec("git", ["cherry", `origin/${branch}`, "HEAD"]);

  return parseSupersession(stdout);
}
