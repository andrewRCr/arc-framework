/** Production adapter for the worktree-derived entering-checkout frame. */

import { access, lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import type { GitExec } from "../lib/git/exec.js";
import { createRawGitExec } from "../lib/io-context.js";
import { projectGitCandidateEffectiveTarget } from "../lib/work-unit/git-candidate-effective-target.js";
import {
  acquireDerivedLocusEvidence,
  createDerivedLocusEvidenceIO,
} from "../lib/locus/derived-evidence.js";
import {
  readDerivedLocusFrame,
  type DerivedLocusFrame,
} from "../lib/locus/derived-reader.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { createUserSurfaceResolver } from "../lib/user-surfaces.js";
import type { DeliveryEntryInspectionResult } from "../lib/delivery/entry-inspection.js";
import { inspectRepositoryDeliveryEntry } from "../lib/delivery/repository-entry.js";
import type { DeliveryCorrectionProjection } from "../lib/locus/subject-meta.js";
import { readPendingCandidateReviewFixAuthority } from
  "../scripts/review-gate/policy/candidate-review-fix-continuation.js";

export interface DerivedLocusStateProbeOptions {
  readonly cwd: string;
  readonly identity: string;
  readonly baseBranch: string;
  readonly activeExtensions?: readonly string[];
  readonly exec: GitExec;
}

const DELIVERY_CORRECTION_STATUS_BY_ENTRY_STATUS = {
  "not-applicable": "none",
  "authoring-required": "none",
  "canonicalize-provisional": "none",
  "validate-canonical": "none",
  "repair-required": "none",
  "resume-bound": "none",
  "correction-routing-required": "authoring-required",
  "review-fix-verification-required": "scoped-verification-required",
  "candidate-renewal-required": "candidate-renewal-required",
  "candidate-verification-required": "verification-required",
  "correction-route-ambiguous": "refused",
  "continue-publication": "none",
  "resolve-delivery-status": "none",
  "reopen-permitted": "none",
  "reopen-bound": "none",
  refused: "refused",
} as const satisfies Record<
  DeliveryEntryInspectionResult["status"],
  DeliveryCorrectionProjection["status"]
>;

/** Project one delivery-entry result into the session's delivery-correction vocabulary. */
export function projectDeliveryEntryCorrection(
  result: Pick<DeliveryEntryInspectionResult, "status" | "recommendedActionText">,
): DeliveryCorrectionProjection {
  const status = DELIVERY_CORRECTION_STATUS_BY_ENTRY_STATUS[result.status];
  return status === "refused"
    ? { status, message: result.recommendedActionText }
    : { status };
}

/** Read the entering frame without record, lock, or process evidence. */
export async function runDerivedLocusStateProbe(
  options: DerivedLocusStateProbeOptions,
): Promise<DerivedLocusFrame> {
  const identity = SlugSchema.parse(options.identity);
  const io = createDerivedLocusEvidenceIO({
    exec: options.exec,
    identity,
    baseBranch: options.baseBranch,
  });
  const evidence = await acquireDerivedLocusEvidence({ identity, io });
  if (evidence.kind === "error") throw new Error(`${evidence.code}: ${evidence.message}`);
  const primary = evidence.topology.worktrees.find((worktree) => worktree.primary);
  const identityGlobalUserDir = createUserSurfaceResolver({
    cwd: options.cwd,
    identity,
    ...(primary === undefined
      ? {}
      : { identityGlobalRoot: join(primary.path, ".arc", "user", identity) }),
  }).identityGlobalRoot;
  return readDerivedLocusFrame({
    identity,
    identityGlobalUserDir,
    activeExtensions: options.activeExtensions ?? [],
    enteringCheckoutPath: options.cwd,
    topology: evidence.topology,
    checkouts: evidence.checkouts,
    completed: evidence.completed,
    identities: evidence.identities,
    primarySafety: evidence.primarySafety,
    canonicalizePath: (path) => io.canonicalizePath(path),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: (path) => access(path).then(() => true, () => false),
      realpath,
      lstat,
      projectDeliveryCorrection: async ({ cwd, workUnitId, taskListPath }) => {
        const result = await inspectRepositoryDeliveryEntry({
          cwd,
          taskListPath,
          request: { workUnitId: SlugSchema.parse(workUnitId), entryMode: "integrating" },
          baseBranch: options.baseBranch,
          exec: options.exec,
        });
        return projectDeliveryEntryCorrection(result);
      },
      projectCandidateTarget: ({ cwd, name, record }) => projectGitCandidateEffectiveTarget({
        cwd,
        name,
        baseBranch: options.baseBranch,
        record,
        exec: options.exec,
        rawExec: createRawGitExec(cwd),
      }),
      readPendingCandidateReviewFixAuthority: ({ cwd, workUnitId, candidate }) =>
        readPendingCandidateReviewFixAuthority({
          cwd,
          exec: options.exec,
          workUnitId,
          candidate,
        }),
    },
  });
}
