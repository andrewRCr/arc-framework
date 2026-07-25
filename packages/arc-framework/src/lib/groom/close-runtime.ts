/** Exact grooming close composition for full and partial protection. */

import { access, lstat, readFile, realpath } from "node:fs/promises";
import { relative } from "node:path";

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
import {
  groomAwaitMergeTransform,
  groomSettleTransform,
  pinGroomOpenedBaseHead,
  rollbackIdentityClaim,
  type GroomIdentityRecord,
  type SettledPartialGroomRecord,
} from "../errand/identity-claims.js";
import { projectLocusIdentity } from "../errand/identity-record.js";
import { transactTransientIdentities } from "../errand/identity-transaction.js";
import { observeExactChangeRequest } from "../errand/leave-runtime.js";
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
  if (anchor.kind !== "process") return refusal("lease-unknown", anchor.reason);
  const inspector = createPlatformProcessInspector();
  const state = await readGroomRuntimeState(options, anchor, inspector);
  const row = exactGroomRow(state, record);
  if (row === null || row.checkoutPath === null) {
    // Occupancy is removed before retirement, so a settled claim outliving its
    // checkout is this close's own unfinished work rather than a missing one.
    if (record.state !== "settled") return refusal("checkout-missing", "Exact grooming occupancy is absent.");
    const rebased = await pinGroomOpenedBaseHead(options.exec, { remote: "origin", baseRef: options.base });
    if (rebased.kind !== "pinned") {
      return refusal("preservation-unproven", rebased.kind === "refused" ? rebased.reason : rebased.message);
    }
    return await retireSettledPartialGroom(options, record, rebased.head, null);
  }
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
    const settled = await settlePartialGroomClaim(options, record, head);
    if (settled.kind === "stopped") return settled.result;
    const popped = await cleanupGroomOccupancy(options, state, row, settled.record, anchor, inspector, head);
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return await retireSettledPartialGroom(options, settled.record, pinned.head, popped.restoredParent);
  }

  const observed = await observeExactChangeRequest(options.exec, record.branch, options.base, head);
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

type PartialGroomSettlement =
  | { kind: "settled"; record: SettledPartialGroomRecord }
  | { kind: "stopped"; result: LocusMutationResultV1 };

/** Record the proven base head in the claim, before occupancy removal can lose it. */
async function settlePartialGroomClaim(
  options: CloseGroomRuntimeOptions,
  record: GroomIdentityRecord,
  head: string,
): Promise<PartialGroomSettlement> {
  if (record.state === "settled") {
    return record.savedHead === head
      ? { kind: "settled", record }
      : {
        kind: "stopped",
        result: refusal("preservation-unproven", "Settled partial grooming head does not match its checkout."),
      };
  }
  const persisted = await transactTransientIdentities(identityIO(options), {
    remote: "origin", message: `arc: settle groom ${options.anchorStub}`,
    transform: groomSettleTransform({
      previous: record, settledHead: head, updatedAt: nextTimestamp(record.updatedAt),
    }),
  });
  if (persisted.kind === "error") {
    return { kind: "stopped", result: failure(`identity-${persisted.stage}`, persisted.message) };
  }
  return persisted.kind === "refused"
    ? { kind: "stopped", result: refusal("identity-conflict", persisted.reason) }
    : { kind: "settled", record: persisted.value };
}

/**
 * Retire a settled partial grooming claim once its head is proven on the base.
 *
 * Reachability from the freshly pinned base head is the proof that survives the
 * checkout: the claim names the head its close settled on, so a claim whose work
 * never reached the base cannot be retired here.
 */
async function retireSettledPartialGroom(
  options: CloseGroomRuntimeOptions,
  record: SettledPartialGroomRecord,
  baseHead: string,
  restoredParent: { recordId: string; checkoutPath: string } | null,
): Promise<LocusMutationResultV1> {
  if (!await isAncestor(options.exec, record.savedHead, baseHead)) {
    return refusal("preservation-unproven", "Settled partial grooming head is not contained in the pushed base.");
  }
  const retired = await rollbackIdentityClaim(identityIO(options), {
    remote: "origin", message: `arc: close groom ${options.anchorStub}`, expected: record,
  });
  if (retired.kind !== "retired") return failure("identity-retire", "Partial grooming claim changed before retirement.");
  return success("applied", null, restoredParent, "Partial grooming completed on the configured base.");
}

export async function readGroomRuntimeState(
  options: CloseGroomRuntimeOptions,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
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
    identityGlobalUserDir: root, enteringAnchor: anchor,
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
  if (acquired.kind !== "acquired") return refusal(acquired.reason === "live" ? "lease-live" : "lease-unknown", "Grooming session locus lock unavailable.");
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
    identity: record === null ? null : projectLocusIdentity(record), originEntry: null,
    restoredParent, nextOffer: null, recommendedPromptText: text,
  });
}

function refusal(reason: LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "plan-close", reason, recommendedPromptText: text });
}

function failure(suffix: string, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation: "plan-close", error: { code: `locus.plan-close.${suffix}`, message },
    recommendedPromptText: "Inspect the retained grooming identity and session locus before retrying.",
  });
}
