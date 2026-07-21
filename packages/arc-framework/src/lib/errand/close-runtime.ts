/** Production ports for exact ordinary-v3 Errand merge finalization. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import { uniqueRefToken } from "../git/ref-tree.js";
import { gitFailureText, normalizeGitRejection } from "../git/process-error.js";
import type { LocusMutationResultV1 } from "../locus/schema/index.js";
import { deleteRemoteBranch } from "../work-unit/mutators/reconcile-branch.js";
import {
  createGhChangeRequestLifecyclePort,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import {
  closeOrdinaryErrand,
  type CloseInboxResult,
  type CloseRefCleanupResult,
} from "./close-locus.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";

export interface CloseOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly base: string;
  readonly protection: "full" | "partial";
  readonly force: boolean;
  readonly identity: string;
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
      readLifecycle: async (record) => {
        if (record.state !== "awaiting-merge") throw new Error("Errand is not awaiting merge");
        const configured = await resolveChangeRequestLifecycleConfiguration(options.exec, options.base)
          ?? { repositoryRef: "", hostRef: "", baseRef: "" };
        return lifecyclePort.read(configured, record.changeRequest);
      },
      cleanupRefs: (record) => cleanupOrdinaryErrandRefs(options.exec, record),
      removeInbox: options.removeInbox,
      retire: async (record, lifecycle) => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: finalize errand ${options.slug}`,
          transform: ordinaryErrandTransform({ kind: "retire", previous: record, reason: "close", lifecycle }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: result.kind };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
    },
  });
}

async function configuredIdentityRemote(exec: GitExec): Promise<"origin" | null> {
  try {
    return (await exec("git", ["remote", "get-url", "origin"])).stdout.trim() === "" ? null : "origin";
  } catch {
    return null;
  }
}

/** Delete only local and remote refs still equal to the recorded merged head. */
export async function cleanupOrdinaryErrandRefs(
  exec: GitExec,
  record: OrdinaryErrandRecord,
): Promise<CloseRefCleanupResult> {
  if (record.state !== "awaiting-merge") {
    return { kind: "refused", reason: "identity-conflict", message: "Errand is not awaiting merge." };
  }
  const expected = record.changeRequest.headSha;
  const localRef = `refs/heads/${record.branch}`;
  const remoteRef = `refs/heads/${record.branch}`;
  const temporaryRef = `refs/arc/tmp/errand-close/${uniqueRefToken()}`;
  const remote = await fetchExactRemoteHead(exec, remoteRef, temporaryRef);
  try {
    await exec("git", ["update-ref", "-d", temporaryRef]);
  } catch (error) {
    if (remote.kind !== "error") return gitCleanupError(error, ["update-ref", "-d", temporaryRef]);
  }
  if (remote.kind === "error") return remote;
  if (remote.kind === "present" && remote.oid !== expected) {
    return { kind: "refused", reason: "preservation-unproven", message: "Remote Errand head moved." };
  }

  const local = await resolveOptionalCommit(exec, localRef);
  if (local.kind === "error") return local;
  if (local.kind === "present" && local.oid !== expected) {
    return { kind: "refused", reason: "preservation-unproven", message: "Local Errand head moved." };
  }

  let changed = false;
  if (remote.kind === "present") {
    try {
      const deleted = await deleteRemoteBranch(exec, "origin", record.branch, expected);
      if (deleted === "stale") {
        return { kind: "refused", reason: "preservation-unproven", message: "Remote Errand head moved." };
      }
      changed ||= deleted === "deleted";
    } catch (error) {
      return gitCleanupError(error, ["push", "origin", "--delete", record.branch]);
    }
  }
  if (local.kind === "present") {
    try {
      await exec("git", ["update-ref", "-d", localRef, expected]);
      changed = true;
    } catch (error) {
      return gitCleanupError(error, ["update-ref", "-d", localRef, expected]);
    }
  }
  return { kind: changed ? "applied" : "idempotent" };
}

type OptionalCommit = { kind: "absent" } | { kind: "present"; oid: string } | Extract<CloseRefCleanupResult, { kind: "error" }>;

async function resolveOptionalCommit(exec: GitExec, ref: string): Promise<OptionalCommit> {
  const args = ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`];
  try {
    const oid = (await exec("git", args)).stdout.trim();
    return /^[0-9a-f]{40}$/u.test(oid) ? { kind: "present", oid } : { kind: "error", message: "Ref resolved to an invalid OID." };
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    return normalized.exitCode === 1 || normalized.exitCode === 128
      ? { kind: "absent" }
      : { kind: "error", message: normalized.message };
  }
}

async function fetchExactRemoteHead(exec: GitExec, remoteRef: string, temporaryRef: string): Promise<OptionalCommit> {
  const args = ["fetch", "--", "origin", `+${remoteRef}:${temporaryRef}`];
  try {
    await exec("git", args);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    return normalized.expectedOutcome === "absent-remote-ref"
      || /(?:could(?:n't| not)|cannot) find remote ref/iu.test(gitFailureText(error))
      ? { kind: "absent" }
      : { kind: "error", message: normalized.message };
  }
  return resolveOptionalCommit(exec, temporaryRef);
}

function gitCleanupError(error: unknown, args: string[]): Extract<CloseRefCleanupResult, { kind: "error" }> {
  return { kind: "error", message: normalizeGitRejection(error, { command: "git", args }).message };
}
