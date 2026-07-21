/** Exact grooming close composition for full and partial protection. */

import { access, lstat, readFile, realpath } from "node:fs/promises";
import { relative } from "node:path";

import { runExtensionsSessionInitStatus } from "../../commands/extensions.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { classifyTransientWorktreeProvenance, readWorktreeMarkerGeneration } from "../git/worktree-marker.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { createLocusMutationResult, popOwnedLocusRole } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import type { LocusMutationResultV1, LocusProcessAnchor, LocusRefusalReason, LocusRowV1, LocusStateV1 } from "../locus/schema/index.js";
import { groomAwaitMergeTransform, pinGroomOpenedBaseHead, rollbackIdentityClaim, type GroomIdentityRecord } from "../errand/identity-claims.js";
import { projectLocusIdentity } from "../errand/identity-record.js";
import { transactTransientIdentities } from "../errand/identity-transaction.js";
import { observeOpenChangeRequest } from "../errand/leave-runtime.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";
import { SlugSchema } from "../kernel/index.js";
import { classifyGroomChangedPaths } from "./path-policy.js";
import { listBacklogStubs } from "../work-unit/backlog-stub.js";

export interface CloseGroomRuntimeOptions {
  readonly anchorStub: string;
  readonly base: string;
  readonly identity: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly cwd: string;
}

/** Validate the exact grooming write set, persist its tail, and close occupancy. */
export async function closeGroomAtRuntime(options: CloseGroomRuntimeOptions): Promise<LocusMutationResultV1> {
  const slug = `groom-${options.anchorStub}`;
  const basis = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: reconcile groom ${options.anchorStub}`,
    transform: (records) => ({ kind: "idempotent", value: records.get(slug) ?? null }),
  });
  if (basis.kind === "error") return failure(`identity-${basis.stage}`, basis.message);
  if (basis.kind === "refused") return refusal("identity-conflict", basis.reason);
  const record = basis.value;
  if (record?.version !== 3 || record.kind !== "groom") {
    return refusal("identity-conflict", `Identity '${slug}' is not a grooming generation.`);
  }
  if (record.state === "awaiting-merge") {
    return success("idempotent", record, null, "Grooming change request is awaiting merge.");
  }
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return refusal("cold-entry-required", anchor.reason);
  const inspector = createPlatformProcessInspector();
  const state = await readGroomRuntimeState(options, anchor, inspector);
  const row = exactGroomRow(state, record);
  if (row === null || row.checkoutPath === null) return refusal("checkout-missing", "Exact grooming occupancy is absent.");
  const checkoutPath = row.checkoutPath;
  const dirty = (await options.exec("git", ["status", "--porcelain"], { cwd: checkoutPath })).stdout;
  if (dirty !== "") return refusal("preservation-unproven", "Grooming checkout has uncommitted changes.");
  const head = (await options.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
  const pinned = await pinGroomOpenedBaseHead(options.exec, { remote: "origin", baseRef: options.base });
  if (pinned.kind !== "pinned") return refusal("preservation-unproven", pinned.kind === "refused" ? pinned.reason : pinned.message);
  const ancestor = await isAncestor(options.exec, record.openedBaseHead, head);
  if (!ancestor) return refusal("preservation-unproven", "Grooming head does not descend from its opened base generation.");
  const paths = await changedPaths(options.exec, record.openedBaseHead, head);
  const cohortPaths = await claimedCohortPaths(options.cwd, record.members);
  const policy = classifyGroomChangedPaths(paths, { members: record.members, cohortPaths });
  if (policy.kind === "refused") {
    return refusal("identity-conflict", `Grooming diff contains unclaimed paths: ${policy.paths.join(", ")}`);
  }

  if (record.protection === "partial") {
    if (head !== pinned.head) return refusal("preservation-unproven", "Partial grooming HEAD is not the freshly pushed base head.");
    const popped = await cleanupGroomOccupancy(options, state, row, record, anchor, inspector, head);
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    const retired = await rollbackIdentityClaim(identityIO(options), {
      remote: "origin", message: `arc: close groom ${options.anchorStub}`, expected: record,
    });
    if (retired.kind !== "retired") return failure("identity-retire", "Partial grooming claim changed before retirement.");
    return success("applied", null, popped.restoredParent, "Partial grooming completed on the configured base.");
  }

  const observed = await observeOpenChangeRequest(options.exec, record.branch, options.base, head);
  if (observed.kind !== "observed") return refusal("change-request-unverifiable", observed.message);
  const persisted = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: close groom ${options.anchorStub}`,
    transform: groomAwaitMergeTransform({ previous: record, changeRequest: observed.changeRequest, updatedAt: nextTimestamp(record.updatedAt) }),
  });
  if (persisted.kind === "error") return failure(`identity-${persisted.stage}`, persisted.message);
  if (persisted.kind === "refused") return refusal("identity-conflict", persisted.reason);
  const popped = await cleanupGroomOccupancy(options, state, row, persisted.value, anchor, inspector, head);
  if (popped.outcome === "refused" || popped.outcome === "error") return popped;
  return success("applied", persisted.value, popped.restoredParent, "Grooming change request preserved; local occupancy closed.");
}

function identityIO(options: CloseGroomRuntimeOptions) {
  return { exec: options.exec, execInput: options.execInput, identity: options.identity };
}

export async function readGroomRuntimeState(
  options: CloseGroomRuntimeOptions,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
  const activeExtensions = await runExtensionsSessionInitStatus({ cwd: options.cwd });
  const root = (await resolveUserSurfaceResolver({
    cwd: options.cwd, identity: SlugSchema.parse(options.identity), exec: options.exec,
  })).identityGlobalRoot;
  return readLocusState({
    identity: options.identity, pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: options.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false), realpath, lstat,
    },
    identityGlobalUserDir: root, activeExtensions: activeExtensions.active, enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({ primaryPath: path, baseBranch: options.base, exec: options.exec }),
  });
}

export function exactGroomRow(state: LocusStateV1, record: GroomIdentityRecord): LocusRowV1 | null {
  const rows = state.roster.rows.filter((row) => row.role?.subject.kind === "groom"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  return rows.length === 1 ? rows[0] ?? null : null;
}

export async function cleanupGroomOccupancy(
  options: CloseGroomRuntimeOptions,
  state: LocusStateV1,
  row: LocusRowV1,
  record: GroomIdentityRecord,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
  expectedHead: string,
): Promise<LocusMutationResultV1> {
  const checkoutPath = row.checkoutPath;
  const recordId = row.recordId;
  const leaseId = row.lease?.leaseId;
  if (checkoutPath === null || recordId === null || leaseId === undefined) return refusal("record-malformed", "Grooming occupancy is incomplete.");
  const runtime = createNodeProvisioningDependencies({
    exec: options.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: record.branch, postCreateScript: options.postCreateScript, registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") return refusal(acquired.reason === "live" ? "lease-live" : "lease-unknown", "Grooming locus lock unavailable.");
  try {
    if (row.primary === true) {
      if (record.branch !== null) await options.exec("git", ["checkout", options.base], { cwd: checkoutPath });
    } else {
      const marker = await readWorktreeMarkerGeneration(checkoutPath);
      const provenance = classifyTransientWorktreeProvenance(marker, { kind: "groom", slug: record.slug, claimId: record.claimId });
      if (provenance?.kind !== "ready") return refusal("role-conflict", "Spawned grooming provenance is not exact.");
      const actual = (await options.exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
      if (actual !== expectedHead) return refusal("preservation-unproven", "Grooming head moved before cleanup.");
      await options.exec("git", ["worktree", "remove", checkoutPath], { cwd: state.roster.primaryPath });
    }
    return await popOwnedLocusRole({
      operation: "plan-close", recommendedPromptText: "Grooming occupancy removed.", recordId, checkoutPath,
      expectedSubject: { kind: "groom", key: record.slug, claimId: record.claimId }, expectedLeaseId: leaseId,
      enteringAnchor: anchor,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        remove: (bytes) => runtime.removeRecord(acquired.handle.recordPath, bytes, acquired.handle),
      },
    });
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function isAncestor(exec: GitExec, ancestor: string, descendant: string): Promise<boolean> {
  try { await exec("git", ["merge-base", "--is-ancestor", ancestor, descendant]); return true; }
  catch { return false; }
}

async function changedPaths(exec: GitExec, from: string, to: string): Promise<string[]> {
  const output = (await exec("git", ["diff", "--name-only", "-z", from, to])).stdout;
  return output.split("\0").filter((path) => path !== "");
}

async function claimedCohortPaths(cwd: string, members: readonly string[]): Promise<string[]> {
  const stubs = await listBacklogStubs(cwd);
  const paths = new Set<string>();
  for (const member of members) {
    const stub = stubs.find((candidate) => candidate.slug === member);
    if (stub === undefined) continue;
    const content = await readFile(stub.metaPath, "utf8");
    const cohort = /^- \*\*Cohort:\*\*\s+`([^`]+)`\s*$/mu.exec(content)?.[1];
    if (cohort === undefined) continue;
    const segments = cohort.split("/");
    const name = segments.at(-1);
    if (name === undefined) continue;
    const path = `${cwd}/.arc/backlog/${stub.stateDir}/${segments.join("/")}/cohort-${name}.md`;
    if (await access(path).then(() => true, () => false)) paths.add(relative(cwd, path).replaceAll("\\", "/"));
  }
  return [...paths];
}

function nextTimestamp(previous: string): string {
  const now = Date.now();
  return new Date(Math.max(now, Date.parse(previous) + 1)).toISOString();
}

function success(
  outcome: "applied" | "idempotent",
  record: GroomIdentityRecord | null,
  restoredParent: { recordId: string; checkoutPath: string } | null,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation: "plan-close", allocation: null, recordId: null, leaseId: null,
    activeLocusPath: null, sessionHomePath: restoredParent?.checkoutPath ?? null,
    identity: record === null ? null : projectLocusIdentity(record), originEntry: null, dispatchId: null,
    routingPlanDigest: null, restoredParent, nextOffer: null, recommendedPromptText: text,
  });
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "plan-close", reason, recommendedPromptText: text });
}

function failure(suffix: string, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation: "plan-close", error: { code: `locus.plan-close.${suffix}`, message },
    recommendedPromptText: "Inspect the retained grooming identity and locus before retrying.",
  });
}
