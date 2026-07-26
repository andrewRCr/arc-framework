/** Production ports for exact ordinary-v3 Errand merge finalization. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExec, GitExecInput } from "../git/exec.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { readLocusState } from "../locus/reader.js";
import type { LocusMutationResultV1, LocusStateV1 } from "../locus/schema/index.js";
import {
  createGhChangeRequestLifecyclePort,
  observeExactChangeRequest,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import { resolveOptionalCommit, tearDownExactBranchGeneration } from "./exact-branch-generation.js";
import { classifyErrandCloseOccupancy } from "./close-occupancy.js";
import {
  closeOrdinaryErrand,
  type CloseInboxResult,
  type CloseOccupancyResult,
  type CloseRefCleanupResult,
  type CloseTarget,
  type CloseTargetResolution,
} from "./close-locus.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";

export interface CloseOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly base: string;
  readonly protection: "full" | "partial";
  readonly force: boolean;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly removeInbox: (record: OrdinaryErrandRecord) => Promise<CloseInboxResult>;
}

/** Run exact host, ref, inbox, and identity finalization against production boundaries. */
export async function closeOrdinaryErrandAtRuntime(
  options: CloseOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const lifecyclePort = createGhChangeRequestLifecyclePort(options.exec);
  const remote = await configuredIdentityRemote(options.exec);
  return closeOrdinaryErrand({
    slug: options.slug,
    protection: options.protection,
    force: options.force,
    dependencies: {
      readIdentity: async () => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: reconcile errand identity ${options.slug}`,
          transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") {
          return { kind: "ready", record: result.value };
        }
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
      resolveTarget: (record) => resolveCloseChangeRequest(options, record),
      readOccupancy: (record) => readCloseOccupancy(options, record),
      readLifecycle: async (target) => {
        const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base)
          ?? { repositoryRef: "", hostRef: "", baseRef: "" };
        return lifecyclePort.read(configured, target.changeRequest);
      },
      cleanupRefs: (target) => cleanupOrdinaryErrandRefs(options.exec, target),
      removeInbox: options.removeInbox,
      retire: async (target, lifecycle) => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: finalize errand ${options.slug}`,
          transform: ordinaryErrandTransform({
            kind: "retire",
            previous: target.record,
            reason: "close",
            changeRequest: target.changeRequest,
            lifecycle,
          }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: result.kind };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
    },
  });
}

/**
 * Read what local occupancy permits for the exact Errand under close.
 *
 * The session anchor is required rather than best-effort: without it the reader cannot say which
 * occupancy is this session's own, and unprovable ownership is refused rather than assumed.
 */
async function readCloseOccupancy(
  options: CloseOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
): Promise<CloseOccupancyResult> {
  const inspector = createPlatformProcessInspector();
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") {
    return {
      kind: "refused",
      reason: "lease-unknown",
      message: `Errand close cannot establish a durable session anchor: ${anchor.reason}`,
    };
  }
  let state: LocusStateV1;
  try {
    state = await readLocusState({
      identity: options.identity,
      pathFlavor: process.platform === "win32" ? "windows" : "posix",
      evidenceIO: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
      subjectMetaIO: {
        readFile: (path) => readFile(path, "utf8"),
        pathExists: async (path) => access(path).then(() => true, () => false),
        realpath,
        lstat,
      },
      identityGlobalUserDir: options.identityGlobalUserDir,
      enteringAnchor: anchor,
      readPrimarySafety: (path) => readPrimarySafety({
        primaryPath: path,
        baseBranch: options.base,
        exec: options.exec,
      }),
    });
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  return classifyErrandCloseOccupancy({ state, slug: record.slug, claimId: record.claimId });
}

/**
 * Resolve the change request close finalizes against.
 *
 * An `awaiting-merge` record already carries exact coordinates. An `open` record merged in
 * place and carries none, so they are observed here against the exact local branch head.
 */
async function resolveCloseChangeRequest(
  options: CloseOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
): Promise<CloseTargetResolution> {
  if (record.state === "awaiting-merge") {
    return { kind: "resolved", changeRequest: record.changeRequest };
  }
  const head = await resolveOptionalCommit(options.exec, `refs/heads/${record.branch}`);
  if (head.kind === "error") return { kind: "error", message: head.message };
  if (head.kind === "absent") {
    return {
      kind: "refused",
      reason: "preservation-unproven",
      message: "The Errand branch is absent locally, so its merged head cannot be proven.",
    };
  }
  const observed = await observeExactChangeRequest(
    options.exec,
    record.branch,
    options.base,
    head.oid,
    "merged",
  );
  return observed.kind === "observed"
    ? { kind: "resolved", changeRequest: observed.changeRequest }
    : { kind: "refused", reason: "change-request-unverifiable", message: observed.message };
}

async function configuredIdentityRemote(exec: GitExec): Promise<"origin" | null> {
  try {
    return (await exec("git", ["remote", "get-url", "origin"])).stdout.trim() === "" ? null : "origin";
  } catch {
    return null;
  }
}

/** Delete only local and remote refs still equal to the proven merged head. */
export async function cleanupOrdinaryErrandRefs(
  exec: GitExec,
  target: CloseTarget,
): Promise<CloseRefCleanupResult> {
  const result = await tearDownExactBranchGeneration(exec, {
    branch: target.record.branch,
    expectedHead: target.changeRequest.headSha,
    subject: "Errand",
    temporaryRefNamespace: "refs/arc/tmp/errand-close",
  });
  return result.kind === "refused"
    ? { kind: "refused", reason: "preservation-unproven", message: result.message }
    : result;
}
