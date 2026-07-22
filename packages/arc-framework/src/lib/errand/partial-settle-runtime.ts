/** Exact completion and abandonment for identity-free partial Errands. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { GitExec } from "../git/exec.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { createLocusMutationResult, popOwnedLocusRole } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import type {
  LocusMutationResultV1,
  LocusRefusalReason,
  LocusRowV1,
  LocusStateV1,
} from "../locus/schema/index.js";
import { pinGroomOpenedBaseHead } from "./identity-claims.js";

type NextOffer = Extract<
  LocusMutationResultV1,
  { outcome: "applied" | "idempotent" }
>["nextOffer"];

export type PartialErrandInboxSettlement =
  | { kind: "applied" | "idempotent"; nextOffer: NextOffer }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export interface SettlePartialErrandRuntimeOptions {
  readonly slug: string;
  readonly action: "close" | "abandon";
  readonly base: string;
  readonly cwd: string;
  readonly identity: string;
  readonly identityGlobalUserDir: string;
  readonly activeExtensions: readonly string[];
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly exec: GitExec;
  readonly settleInbox: (binding: {
    readonly originEntry: string | null;
    readonly parentCheckoutPath: string | null;
  }) => Promise<PartialErrandInboxSettlement>;
}

/** Prove one direct-base result, settle its capture binding, and pop the exact live role. */
export async function settlePartialErrandAtRuntime(
  options: SettlePartialErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const operation = options.action === "close" ? "errand-close" : "errand-abandon";
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return refusal(operation, "lease-unknown", anchor.reason);
  const inspector = createPlatformProcessInspector();
  const state = await readRuntimeState(options, anchor, inspector);
  const target = exactPartialErrandRow(state, options.slug);
  if (target.kind === "duplicate") {
    return refusal(operation, "duplicate-locus", `Partial Errand '${options.slug}' has ambiguous occupancy.`);
  }
  if (target.row === null) {
    return success(options, "idempotent", null, null, null, `Partial Errand '${options.slug}' is already settled.`);
  }
  const row = target.row;
  if (row.primary !== true || row.checkoutPath === null || row.recordId === null || row.lease?.leaseId === undefined) {
    return refusal(operation, "record-malformed", "Partial Errand occupancy is incomplete or not primary-owned.");
  }
  const role = row.role;
  if (role === null) return refusal(operation, "record-malformed", "Partial Errand role is absent.");

  const pinned = await pinGroomOpenedBaseHead(options.exec, { remote: "origin", baseRef: options.base });
  if (pinned.kind !== "pinned") {
    return refusal(
      operation,
      "preservation-unproven",
      pinned.kind === "refused" ? pinned.reason : pinned.message,
    );
  }
  const ready = await verifyExactBase(options.exec, row.checkoutPath, options.base, pinned.head);
  if (ready !== null) return refusal(operation, "preservation-unproven", ready);

  let inbox: PartialErrandInboxSettlement;
  try {
    inbox = await options.settleInbox({
      originEntry: role.originEntry,
      parentCheckoutPath: role.parentCheckoutPath,
    });
  } catch (error) {
    return failure(operation, "inbox", error);
  }
  if (inbox.kind === "refused") return refusal(operation, "identity-conflict", inbox.reason);
  if (inbox.kind === "error") return failure(operation, "inbox", inbox.message);

  const runtime = createNodeProvisioningDependencies({
    exec: options.exec,
    identity: options.identity,
    anchor,
    inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix",
    base: options.base,
    branch: null,
    postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(row.checkoutPath);
  if (acquired.kind !== "acquired") {
    return refusal(
      operation,
      acquired.reason === "live" ? "lease-live" : "lease-unknown",
      "Partial Errand locus lock is unavailable.",
    );
  }
  try {
    const revalidated = await verifyExactBase(options.exec, row.checkoutPath, options.base, pinned.head);
    if (revalidated !== null) return refusal(operation, "preservation-unproven", revalidated);
    const popped = await popOwnedLocusRole({
      operation,
      recommendedPromptText: "Partial Errand occupancy removed.",
      recordId: row.recordId,
      checkoutPath: row.checkoutPath,
      expectedSubject: { kind: "partial-errand", key: options.slug, claimId: null },
      expectedLeaseId: row.lease.leaseId,
      enteringAnchor: anchor,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        remove: (bytes) => runtime.removeRecord(acquired.handle.recordPath, bytes, acquired.handle),
      },
    });
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return success(
      options,
      popped.outcome === "applied" || inbox.kind === "applied" ? "applied" : "idempotent",
      row,
      restoredParent(state, row),
      inbox.nextOffer,
      options.action === "close"
        ? `Completed partial Errand '${options.slug}' on the configured base.`
        : `Abandoned partial Errand '${options.slug}' and retained its capture.`,
    );
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

function exactPartialErrandRow(
  state: LocusStateV1,
  slug: string,
): { kind: "ready"; row: LocusRowV1 | null } | { kind: "duplicate" } {
  const rows = state.roster.rows.filter((row) => row.role?.subject.kind === "partial-errand"
    && row.role.subject.key === slug && row.role.subject.claimId === null);
  if (rows.length > 1) return { kind: "duplicate" };
  return { kind: "ready", row: rows[0] ?? null };
}

async function readRuntimeState(
  options: SettlePartialErrandRuntimeOptions,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
  return readLocusState({
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
    activeExtensions: options.activeExtensions,
    enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({
      primaryPath: path,
      baseBranch: options.base,
      exec: options.exec,
    }),
  });
}

async function verifyExactBase(exec: GitExec, cwd: string, base: string, expectedHead: string): Promise<string | null> {
  try {
    const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).stdout.trim();
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
    const dirty = (await exec("git", ["status", "--porcelain"], { cwd })).stdout;
    return branch === base && head === expectedHead && dirty === ""
      ? null
      : "Partial Errand checkout is dirty, off the configured base, or not at its freshly pushed head.";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function restoredParent(
  state: LocusStateV1,
  row: LocusRowV1,
): { recordId: string; checkoutPath: string } | null {
  const parentPath = row.role?.parentCheckoutPath;
  if (parentPath === null || parentPath === undefined) return null;
  const parent = state.roster.rows.find((candidate) => candidate.checkoutPath === parentPath
    && candidate.role?.kind === "work-unit" && candidate.recordId !== null);
  return parent?.recordId !== null && parent?.recordId !== undefined && parent.checkoutPath !== null
    ? { recordId: parent.recordId, checkoutPath: parent.checkoutPath }
    : null;
}

function success(
  options: SettlePartialErrandRuntimeOptions,
  outcome: "applied" | "idempotent",
  row: LocusRowV1 | null,
  parent: { recordId: string; checkoutPath: string } | null,
  nextOffer: NextOffer,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome,
    operation: options.action === "close" ? "errand-close" : "errand-abandon",
    allocation: null,
    recordId: row?.recordId ?? null,
    leaseId: null,
    activeLocusPath: null,
    sessionHomePath: parent?.checkoutPath ?? null,
    identity: null,
    originEntry: row?.role?.originEntry ?? null,
    restoredParent: parent,
    nextOffer,
    recommendedPromptText: text,
  });
}

function refusal(
  operation: "errand-close" | "errand-abandon",
  reason: LocusRefusalReason,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation, reason, recommendedPromptText: text });
}

function failure(
  operation: "errand-close" | "errand-abandon",
  suffix: string,
  error: unknown,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation,
    error: {
      code: `locus.${operation}.${suffix}`,
      message: error instanceof Error ? error.message : String(error),
    },
    recommendedPromptText: "Inspect the retained partial Errand role and exact base evidence before retrying.",
  });
}
