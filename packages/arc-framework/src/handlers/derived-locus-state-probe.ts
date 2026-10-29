/** Production adapter for the worktree-derived entering-checkout frame. */

import { access, lstat, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { resolveArcPath } from "../lib/layout/index.js";

import type { Store } from "../lib/store/contract.js";
import type { StateVersion } from "../lib/store/identity.js";
import { createStore } from "../lib/store/create.js";
import { createDefaultStorePorts } from "../lib/store/default-ports.js";
import { createProjectIdentityReader } from "../lib/store/project-identity.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
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
import { withEnteringUnclosedTaskCommits } from "../lib/locus/entering-unclosed-task-commits.js";
import type { DeliveryEntryInspectionResult } from "../lib/delivery/entry-inspection.js";
import { inspectRepositoryDeliveryEntry } from "../lib/delivery/repository-entry.js";
import type { DeliveryCorrectionProjection } from "../lib/locus/subject-meta.js";
import { readPendingCandidateReviewFixAuthority } from
  "../scripts/review-gate/policy/candidate-review-fix-continuation.js";

export interface DerivedLocusStateProbeOptions {
  readonly cwd: string;
  readonly store?: Store;
  readonly projectId?: () => Promise<string>;
  readonly archiveCadence?: "manual" | "with-integration";
  readonly identity: string;
  readonly baseBranch: string;
  readonly exec: GitExec;
}

/** A frame and the operational anchor used for its record projections. */
export interface DerivedLocusStateSnapshot { frame: DerivedLocusFrame; stateVersion: StateVersion | null }

/** Capture the frame's operational anchor, using the caller's version-refusal policy when supplied. */
export async function readDerivedLocusStateSnapshot(options: DerivedLocusStateProbeOptions,
  readVersion?: (store: Store) => Promise<StateVersion>): Promise<DerivedLocusStateSnapshot> {
  const store = options.store ?? createStore(createDefaultStorePorts({ checkoutRoot: options.cwd, exec: options.exec }));
  const stateVersion = !store.capabilities.stateOffBranch ? null : readVersion === undefined
    ? await store.version().then(version => version.status === "ok" ? version.result : null) : await readVersion(store);
  const selected = stateVersion === null ? store : storeAtVersion(store, stateVersion);
  const frame = await runDerivedLocusStateProbe({ ...options, store: selected });
  return { frame, stateVersion };
}

function storeAtVersion(store: Store, stateVersion: StateVersion): Store {
  return {
    capabilities: store.capabilities,
    read: input => store.read({ ...input, asOf: input.asOf ?? stateVersion }),
    list: input => store.list({ ...input, asOf: input.asOf ?? stateVersion }),
    version: () => Promise.resolve({ status: "ok", result: stateVersion }),
    lookup: input => store.lookup(input), history: input => store.history(input), changes: input => store.changes(input),
    write: input => store.write(input), batch: input => store.batch(input),
    pull: input => store.pull(input), push: input => store.push(input), maintain: () => store.maintain(),
  };
}

const DELIVERY_CORRECTION_STATUS_BY_ENTRY_STATUS = {
  "not-applicable": "none",
  "authoring-required": "none",
  "canonicalize-provisional": "none",
  "validate-canonical": "none",
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
  const store = options.store ?? createStore(createDefaultStorePorts({ checkoutRoot: options.cwd, exec: options.exec }));
  const projectId = options.projectId ?? (store.capabilities.stateOffBranch ? createProjectIdentityReader(store) : undefined);
  const configuredCadence = store.capabilities.stateOffBranch
    ? options.archiveCadence ?? (await readConfigSettings(options.cwd)).settings["archive.cadence"]
    : undefined;
  const archiveCadence = configuredCadence === "manual" ? "manual" : "with-integration";
  const io = createDerivedLocusEvidenceIO({
    store, projectId, archiveCadence,
    exec: options.exec,
    identity,
    baseBranch: options.baseBranch,
  });
  const evidence = await acquireDerivedLocusEvidence({ identity, io });
  if (evidence.kind === "error") throw new Error(`${evidence.code}: ${evidence.message}`);
  const primary = evidence.topology.worktrees.find((worktree) => worktree.primary);
  const identityGlobalUserDir = join(primary?.path ?? options.cwd, resolveArcPath({ kind: "user-root", identity }));
  const frame = await readDerivedLocusFrame({
    identity,
    store,
    identityGlobalUserDir,
    enteringCheckoutPath: options.cwd,
    topology: evidence.topology,
    checkouts: evidence.checkouts,
    completed: evidence.completed,
    identities: evidence.identities,
    identityAcquisitions: evidence.identityAcquisitions,
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
  return withEnteringUnclosedTaskCommits(frame, { ...options, store, projectId, execRaw: createRawGitExec(options.cwd) });
}
