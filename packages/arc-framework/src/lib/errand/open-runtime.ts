/** Production authority, reader, and provisioning composition for ordinary Errand open. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExecInput } from "../git/exec.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { provisionTransientLocus } from "../locus/provisioning.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import {
  createPlatformProcessAncestryInspector,
  createPlatformProcessInspector,
} from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import type { LocusAnchor, LocusMutationResultV1 } from "../locus/schema/index.js";
import type { GitExec } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import { rollbackIdentityClaim } from "./identity-claims.js";
import {
  ordinaryErrandTransform,
  provePauseHead,
  rollbackOrdinaryErrandResumeTransform,
  type OrdinaryErrandRecord,
} from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import {
  openOrdinaryErrand,
  type ResumeAuthorizationResult,
} from "./open.js";
import {
  createGhChangeRequestLifecyclePort,
  evaluateChangeRequestReentry,
  resolveChangeRequestLifecycleConfiguration,
} from "./change-request-lifecycle.js";

export interface OpenOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly intent?: string;
  readonly originEntry: string | null;
  readonly dispatchId: string | null;
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly createdAt: string;
  readonly identity: string;
  readonly locationTemplate: string;
  readonly repo: string;
  readonly leaseId: string;
  readonly isolation?: "prefer-primary" | "require-isolation";
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly identityGlobalUserDir: string;
  readonly activeExtensions: readonly string[];
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
}

/** Run the complete production ordinary-Errand open composition. */
export async function openOrdinaryErrandAtRuntime(
  options: OpenOrdinaryErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const inspector = createPlatformProcessInspector();
  const ancestry = createPlatformProcessAncestryInspector();
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  let selectedAnchor: LocusAnchor | null = null;
  return openOrdinaryErrand({
    slug: options.slug,
    intent: options.intent,
    originEntry: options.originEntry,
    dispatchId: options.dispatchId,
    protection: options.protection,
    base: options.base,
    createdAt: options.createdAt,
    identityName: options.identity,
    locationTemplate: options.locationTemplate,
    repo: options.repo,
    leaseId: options.leaseId,
    isolation: options.isolation,
    dependencies: {
      acquireAnchor: async () => {
        const anchor = await acquireSessionAnchor(process.pid, ancestry);
        selectedAnchor = anchor;
        return anchor;
      },
      readState: async () => {
        if (selectedAnchor === null) throw new Error("Entering process anchor is unavailable");
        return readLocusState({
          identity: options.identity,
          pathFlavor,
          evidenceIO: createLocusEvidenceIO({
            exec: options.exec,
            identity: options.identity,
            inspector,
          }),
          subjectMetaIO: {
            readFile: (path) => readFile(path, "utf8"),
            pathExists: async (path) => access(path).then(() => true, () => false),
            realpath,
            lstat,
          },
          identityGlobalUserDir: options.identityGlobalUserDir,
          activeExtensions: options.activeExtensions,
          enteringAnchor: selectedAnchor,
          readPrimarySafety: (path) => readPrimarySafety({
            primaryPath: path,
            baseBranch: options.base,
            exec: options.exec,
          }),
        });
      },
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
          return { kind: "ready" as const, record: read.value };
        }
        return read.kind === "refused"
          ? { kind: "refused" as const, reason: read.reason }
          : { kind: "error" as const, message: read.message };
      },
      authorizeResume: (record) => authorizeOrdinaryErrandResume(options.exec, options.base, record),
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
            identity: options.identity,
            anchor: request.anchor,
            inspector,
            pathFlavor,
            base: options.base,
            branch: request.branch,
            postCreateScript: options.postCreateScript,
            registeredHarnessDirs: options.registeredHarnessDirs,
          }),
        });
      },
    },
  });
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
): Promise<ResumeAuthorizationResult> {
  if (record.state === "paused") {
    const proof = await provePauseHead(exec, {
      remote: "origin",
      branch: record.branch,
      savedHead: record.savedHead,
    });
    if (proof.kind === "proven") return { kind: "authorized", authorization: proof.evidence };
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
    return reentry.kind === "authorized"
      ? { kind: "authorized", authorization: lifecycle, ...(reentry.advisory === undefined ? {} : { advisory: reentry.advisory }) }
      : reentry;
  }
  return { kind: "refused", reason: "Open identity already has no resume transition." };
}
