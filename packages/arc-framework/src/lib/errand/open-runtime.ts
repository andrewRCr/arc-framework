/** Production authority, reader, and provisioning composition for ordinary Errand open. */

import type { GitExecInput } from "../git/exec.js";
import { syncLocalBase } from "../git/base-sync.js";
import { provisionTransientLocus } from "../locus/provisioning.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { runDerivedLocusStateProbe } from "../../handlers/derived-locus-state-probe.js";
import type { GitExec } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import { rollbackIdentityClaim } from "./identity-claims.js";
import {
  ordinaryErrandTransform,
  provePauseHead,
  rollbackOrdinaryErrandResumeTransform,
  type OrdinaryErrandRecord,
} from "./identity-transitions.js";
import type { TransientIdentityRecord } from "./identity-record.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import {
  openOrdinaryErrandWithDisposition,
  type OpenOrdinaryErrandExecution,
  type ResumeAuthorizationResult,
} from "./open.js";
import {
  createGhChangeRequestLifecyclePort,
  evaluateChangeRequestReentry,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";
import type { InspectedInboxEntry } from "../user-sync/inbox-writer.js";
import type { ErrandOperationResult } from "./operation-result.js";

export interface OpenOrdinaryErrandRuntimeOptions {
  readonly cwd: string;
  readonly slug: string;
  readonly intent?: string;
  readonly inbox: InspectedInboxEntry | null;
  readonly protection: "full" | "partial";
  readonly base: string;
  /** Whether a new Errand branch must first synchronize the configured local base. */
  readonly syncBase: boolean;
  readonly createdAt: string;
  readonly identity: string;
  readonly locationTemplate: string;
  readonly repo: string;
  readonly isolation?: "prefer-primary" | "require-isolation";
  readonly changeRequestReentry?: "advisory" | "strict";
  readonly pausedHeadReentry?: "ancestry" | "exact";
  readonly expectedResumeGeneration?: {
    readonly claimId: string;
    readonly expectedHead: string;
  };
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly identityGlobalUserDir: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
}

/**
 * Run the complete production ordinary-Errand open composition.
 * @param options - Runtime identity, topology, and provisioning inputs.
 * @returns The public mutation result.
 */
export async function openOrdinaryErrandAtRuntime(
  options: OpenOrdinaryErrandRuntimeOptions,
): Promise<ErrandOperationResult> {
  return (await openOrdinaryErrandAtRuntimeWithDisposition(options)).result;
}

/**
 * Run production ordinary-Errand open with internal rollback evidence for composing callers.
 * @param options - Runtime identity, topology, and provisioning inputs.
 * @returns The mutation result and whether failed provisioning retained recovery state.
 */
export async function openOrdinaryErrandAtRuntimeWithDisposition(
  options: OpenOrdinaryErrandRuntimeOptions,
): Promise<OpenOrdinaryErrandExecution> {
  return openOrdinaryErrandWithDisposition({
    slug: options.slug,
    intent: options.intent,
    inbox: options.inbox,
    protection: options.protection,
    base: options.base,
    createdAt: options.createdAt,
    identityName: options.identity,
    locationTemplate: options.locationTemplate,
    repo: options.repo,
    isolation: options.isolation,
    dependencies: {
      readFrame: () => runDerivedLocusStateProbe({
        cwd: options.cwd,
        identity: options.identity,
        baseBranch: options.base,
        exec: options.exec,
      }),
      readIdentity: async () => {
        const read = await transactTransientIdentities({
          exec: options.exec,
          execInput: options.execInput,
          identity: options.identity,
        }, {
          remote: "origin",
          message: `arc: reconcile errand identity ${options.slug}`,
          transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
        });
        if (read.kind === "applied" || read.kind === "idempotent") {
          if (options.expectedResumeGeneration !== undefined
            && !matchesExpectedResumeGeneration(read.value, options.expectedResumeGeneration)) {
            return { kind: "refused" as const, reason: "Errand generation changed before materialization." };
          }
          return { kind: "ready" as const, record: read.value };
        }
        return read.kind === "refused"
          ? { kind: "refused" as const, reason: read.reason }
          : { kind: "error" as const, message: read.message };
      },
      authorizeResume: (record) => authorizeOrdinaryErrandResume(
        options.exec,
        options.base,
        record,
        options.changeRequestReentry,
        options.pausedHeadReentry,
      ),
      recoverOpen: (record) => recoverOpenIdentityBranch(options.exec, record),
      claim: async (record) => {
        const claimed = await transactTransientIdentities({
          exec: options.exec,
          execInput: options.execInput,
          identity: options.identity,
        }, {
          remote: "origin",
          message: `arc: open errand ${record.slug}`,
          transform: ordinaryErrandTransform({ kind: "create", record }),
        });
        if (claimed.kind === "applied" || claimed.kind === "idempotent") {
          if (claimed.value === null) return { kind: "error", message: "Identity claim returned no record" };
          return { kind: claimed.kind, record: claimed.value };
        }
        return claimed.kind === "refused"
          ? { kind: "refused", reason: claimed.reason }
          : { kind: "error", message: claimed.message };
      },
      resume: async (record, authorization, updatedAt) => {
        const resumed = await transactTransientIdentities({
          exec: options.exec,
          execInput: options.execInput,
          identity: options.identity,
        }, {
          remote: "origin",
          message: `arc: resume errand ${record.slug}`,
          transform: ordinaryErrandTransform({ kind: "resume", previous: record, authorization, updatedAt }),
        });
        if (resumed.kind === "applied" || resumed.kind === "idempotent") {
          if (resumed.value === null) return { kind: "error" as const, message: "Resume returned no identity" };
          return { kind: resumed.kind, record: resumed.value };
        }
        return resumed.kind === "refused"
          ? { kind: "refused" as const, reason: resumed.reason }
          : { kind: "error" as const, message: resumed.message };
      },
      rollbackClaim: async (record) => {
        const rolledBack = await rollbackIdentityClaim({
          exec: options.exec,
          execInput: options.execInput,
          identity: options.identity,
        }, {
          remote: "origin",
          message: `arc: roll back errand ${record.slug}`,
          expected: record,
        });
        return rolledBack.kind === "retired"
          ? { kind: "rolled-back" }
          : { kind: "generation-mismatch" };
      },
      rollbackResume: async (previous, resumed) => {
        const rollback = await transactTransientIdentities({
          exec: options.exec,
          execInput: options.execInput,
          identity: options.identity,
        }, {
          remote: "origin",
          message: `arc: roll back errand resume ${previous.slug}`,
          transform: rollbackOrdinaryErrandResumeTransform(previous, resumed),
        });
        return rollback.kind === "applied" || rollback.kind === "idempotent"
          ? { kind: "rolled-back" as const }
          : { kind: "generation-mismatch" as const };
      },
      provision: async (request) => {
        return provisionTransientLocus({
          ...request,
          dependencies: createNodeProvisioningDependencies({
            exec: options.exec,
            base: options.base,
            branch: request.branch,
            ...(options.syncBase ? {
              synchronizeBase: () => syncLocalBase({ exec: options.exec, baseBranch: options.base }),
            } : {}),
            postCreateScript: options.postCreateScript,
            registeredHarnessDirs: options.registeredHarnessDirs,
          }),
        });
      },
    },
  });
}

function matchesExpectedResumeGeneration(
  record: TransientIdentityRecord | null,
  expected: { readonly claimId: string; readonly expectedHead: string },
): boolean {
  if (record === null || record.kind !== "errand" || record.purpose !== "errand"
    || record.claimId !== expected.claimId) return false;
  if (record.state === "paused") return record.savedHead === expected.expectedHead;
  return record.state === "awaiting-merge" && record.changeRequest.headSha === expected.expectedHead;
}

async function recoverOpenIdentityBranch(
  exec: GitExec,
  record: OrdinaryErrandRecord,
): Promise<
  | { kind: "ready"; expectedBranchHead: string | null }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string }
> {
  const ref = `refs/heads/${record.branch}`;
  const existsArgs = ["show-ref", "--verify", "--quiet", ref];
  try {
    await exec("git", existsArgs);
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: existsArgs });
    return normalized.exitCode === 1
      ? { kind: "ready", expectedBranchHead: null }
      : { kind: "error", message: normalized.message };
  }
  let head: string;
  try {
    head = (await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`])).stdout.trim();
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  const proof = await provePauseHead(exec, { remote: "origin", branch: record.branch, savedHead: head });
  if (proof.kind === "proven") return { kind: "ready", expectedBranchHead: head };
  return proof.kind === "refused"
    ? { kind: "refused", reason: proof.reason }
    : { kind: "error", message: proof.message };
}

/** Prove the state-specific preservation or host predicate for ordinary Errand resume. */
export async function authorizeOrdinaryErrandResume(
  exec: GitExec,
  base: string,
  record: OrdinaryErrandRecord,
  changeRequestReentry: "advisory" | "strict" = "advisory",
  pausedHeadReentry: "ancestry" | "exact" = "ancestry",
): Promise<ResumeAuthorizationResult> {
  if (record.state === "paused") {
    const proof = await provePauseHead(exec, {
      remote: "origin",
      branch: record.branch,
      savedHead: record.savedHead,
    });
    if (proof.kind === "proven") {
      if (pausedHeadReentry === "exact" && proof.evidence.remoteBranchTip !== record.savedHead) {
        return { kind: "refused", reason: "Paused materialization requires the exact remote head." };
      }
      return { kind: "authorized", authorization: proof.evidence };
    }
    return proof.kind === "refused"
      ? { kind: "refused", reason: proof.reason }
      : { kind: "error", message: proof.message };
  }
  if (record.state === "awaiting-merge") {
    const configured = await resolveChangeRequestLifecycleConfiguration(exec, base);
    if (configured === null) {
      return { kind: "refused", reason: "Configured origin coordinates are unavailable." };
    }
    const lifecycle = await createGhChangeRequestLifecyclePort(exec).read(configured, record.changeRequest);
    const reentry = evaluateChangeRequestReentry(lifecycle, record.changeRequest);
    if (changeRequestReentry === "strict" && reentry.kind === "authorized"
      && lifecycle.kind !== "open" && lifecycle.kind !== "requested-work") {
      return { kind: "refused", reason: `Host truth is ${lifecycle.kind}, not an exact open change request.` };
    }
    return reentry.kind === "authorized"
      ? { kind: "authorized", authorization: lifecycle, ...(reentry.advisory === undefined ? {} : { advisory: reentry.advisory }) }
      : reentry;
  }
  return { kind: "refused", reason: "Open identity already has no resume transition." };
}
