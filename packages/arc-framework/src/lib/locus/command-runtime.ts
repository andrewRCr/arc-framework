/** Production state-touching commands over exact reader-selected locus generations. */

import { access, lstat, readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import type { UserIOContext } from "../../commands/user/types.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { readTransientIdentitySnapshot } from "../errand/identity-snapshot.js";
import type { GitExecInput } from "../git/exec.js";
import { scanRegisteredWorktrees, type RegisteredWorktree } from "../git/worktree-roster.js";
import {
  decodeWorktreeMarkerOwnership,
  readWorktreeMarkerGeneration,
  type WorktreeMarkerGenerationReadResult,
} from "../git/worktree-marker.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";
import { createLocusEvidenceIO } from "./evidence.js";
import {
  attachLocusLease,
  createLocusMutationResult,
  mintDurableLocusRole,
  releaseLocusLease,
  resumeDeadTransientLease,
  type LocusRoleAuthority,
} from "./mutation.js";
import { deriveLocusRecordId } from "./path-identity.js";
import { appendDirectedCommandAdvisory } from "./entry-boundary.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "./platform-inspectors.js";
import { acquireSessionAnchor } from "./process-inspector.js";
import { readPrimarySafety } from "./primary-safety.js";
import { createNodeProvisioningDependencies } from "./provisioning-runtime.js";
import { readLocusState } from "./reader.js";
import {
  type LocusAnchor,
  type LocusMutationResultV1,
  type LocusRefusalReason,
  type LocusRowV1,
  type LocusStateV1,
  locusErrorCode,
} from "./schema/index.js";
import { deriveTransientAdoptionCandidate } from "./reconciliation.js";
import { resolveLocusGeneration, type LocusResolveDispatch } from "./resolve-driver.js";
import {
  projectTrustedLocusRow,
  trustedLocusRows,
  untrustedRefusalReason,
  type TrustedLocusRow,
} from "./trusted-row.js";

export interface LocusCommandRuntimeOptions {
  readonly checkout?: string;
  readonly recordId?: string;
  readonly base: string;
  readonly identity: string;
  readonly cwd: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly io: UserIOContext & { execInput: GitExecInput };
}

export interface ResolveLocusRuntimeOptions extends LocusCommandRuntimeOptions {
  readonly recordId: string;
  readonly action: "resume" | "abandon";
  /** Operator attestation that no live session holds the selected lease. */
  readonly confirmedNoLiveSession: boolean;
  abandon(dispatch: LocusResolveDispatch): Promise<LocusMutationResultV1>;
}

/**
 * Read the locus state through the command runtime's resolved user and evidence surfaces.
 *
 * @param options - Command identity, checkout, base, and process-execution context.
 * @param anchor - Entering session anchor used to identify a self-held lease.
 * @param inspector - Platform process inspector used to classify persisted process anchors.
 * @returns The current roster, occupancy, recovery, and reconciliation projection.
 */
export async function readCommandLocusState(
  options: Pick<LocusCommandRuntimeOptions, "cwd" | "identity" | "base" | "io">,
  anchor: LocusAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
  const root = (await resolveUserSurfaceResolver({
    cwd: options.cwd,
    identity: SlugSchema.parse(options.identity),
    exec: options.io.exec,
  })).identityGlobalRoot;
  return readLocusState({
    identity: options.identity,
    pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: options.io.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false),
      realpath,
      lstat,
    },
    identityGlobalUserDir: root,
    enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({
      primaryPath: path,
      baseBranch: options.base,
      exec: options.io.exec,
    }),
  });
}

/** Attach the entering process to one trusted managed role selected by the locus reader. */
export async function attachLocusAtRuntime(options: LocusCommandRuntimeOptions): Promise<LocusMutationResultV1> {
  const adopted = await adoptTrustedRoleAtRuntime(options);
  if (adopted.kind === "result") return adopted.result;
  const prepared = await prepare(options, "locus-attach");
  if (prepared.kind === "result") return prepared.result;
  const { anchor, row, checkoutPath, runtime } = prepared;
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") return lockRefusal("locus-attach", acquired.reason);
  try {
    const current = await runtime.readRecord(acquired.handle.recordPath, acquired.handle);
    if (current.kind !== "valid" || current.record.recordId !== row.recordId) {
      return refusal("locus-attach", "record-malformed", "The selected role generation changed before attach.");
    }
    const existingLeaseId = current.record.lease !== null
      && isDeepStrictEqual(current.record.lease.anchor, anchor)
      ? current.record.lease.leaseId
      : undefined;
    const now = new Date().toISOString();
    const attached = await attachLocusLease({
      recordId: current.record.recordId,
      sessionHomePath: checkoutPath,
      anchor,
      ...(existingLeaseId === undefined ? {} : { leaseId: existingLeaseId }),
      attachedAt: current.record.lease?.attachedAt ?? now,
      heartbeatAt: now,
      observedLeaseId: current.record.lease?.leaseId ?? null,
      observedLiveness: row.lease?.state ?? null,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        replace: (bytes, record) => runtime.replaceRecord(acquired.handle.recordPath, bytes, record, acquired.handle),
      },
    });
    if (attached.kind === "refused") return refusal("locus-attach", attached.reason, "The selected lease cannot be attached safely.");
    return success("locus-attach", attached.kind, row, attached.record.lease?.leaseId ?? null);
  } catch (error) {
    return failure("locus-attach", error);
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function adoptTrustedRoleAtRuntime(
  options: LocusCommandRuntimeOptions,
): Promise<{ kind: "not-applicable" } | { kind: "result"; result: LocusMutationResultV1 }> {
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  const checkoutPath = resolve(options.cwd, options.checkout ?? ".");
  const roster = await scanRegisteredWorktrees(options.io.exec);
  if (!roster.ok) return { kind: "not-applicable" };
  const matches = roster.worktrees.filter((checkout) => resolve(checkout.path) === checkoutPath);
  const checkout = matches.length === 1 ? matches[0] : undefined;
  if (checkout === undefined) return { kind: "not-applicable" };
  const marker = await readWorktreeMarkerGeneration(checkout.path);
  if (!checkout.primary && marker.kind !== "present") return { kind: "not-applicable" };
  if (options.checkout === undefined
    && marker.kind === "absent"
    && await deriveWorkUnitSubject(options, checkout, marker) === null) {
    return { kind: "not-applicable" };
  }
  const pathFlavor = process.platform === "win32" ? "windows" : "posix";
  const recordId = deriveLocusRecordId(checkout.path, pathFlavor);
  const inspector = createPlatformProcessInspector();
  const runtime = createNodeProvisioningDependencies({
    exec: options.io.exec, identity: options.identity, anchor, inspector, pathFlavor,
    base: options.base, branch: checkout.branch, postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(checkout.path);
  if (acquired.kind !== "acquired") {
    return { kind: "result", result: lockRefusal("locus-attach", acquired.reason) };
  }
  try {
    const existing = await runtime.readRecord(acquired.handle.recordPath, acquired.handle);
    if (existing.kind !== "absent") return { kind: "not-applicable" };
    const [lockedRoster, lockedMarker, identities] = await Promise.all([
      scanRegisteredWorktrees(options.io.exec),
      readWorktreeMarkerGeneration(checkout.path),
      readTransientIdentitySnapshot({ exec: options.io.exec, identity: options.identity }),
    ]);
    if (!lockedRoster.ok) {
      return { kind: "result", result: refusal(
        "locus-attach", "preservation-unproven", "The checkout roster changed before trusted role adoption.",
      ) };
    }
    const lockedMatches = lockedRoster.worktrees.filter((candidate) => resolve(candidate.path) === checkoutPath);
    const lockedCheckout = lockedMatches.length === 1 ? lockedMatches[0] : undefined;
    if (lockedCheckout === undefined) {
      return { kind: "result", result: refusal(
        "locus-attach", "checkout-missing", "The selected checkout disappeared before transient adoption.",
      ) };
    }
    const adoption = await deriveRuntimeAdoption({
      options,
      checkout: lockedCheckout,
      marker: lockedMarker,
      identities,
      recordId: recordId.recordId,
      recordPath: acquired.handle.recordPath,
    });
    if (adoption === null) {
      return { kind: "result", result: refusal(
        "locus-attach", "role-conflict", "The selected checkout has no exact adoptable authority.",
      ) };
    }
    const now = new Date().toISOString();
    const minted = await mintDurableLocusRole({
      recordId: recordId.recordId,
      checkoutPath,
      parentCheckoutPath: null,
      establishedAt: now,
      authority: adoption.authority,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        mint: (record) => runtime.mintRecord(acquired.handle.recordPath, record, acquired.handle),
      },
    });
    if (minted.kind === "refused") {
      return { kind: "result", result: refusal(
        "locus-attach", minted.reason, "The trusted role changed before adoption completed.",
      ) };
    }
    const attached = await attachLocusLease({
      recordId: recordId.recordId,
      sessionHomePath: checkoutPath,
      anchor,
      attachedAt: now,
      heartbeatAt: now,
      observedLeaseId: null,
      observedLiveness: null,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        replace: (bytes, record) => runtime.replaceRecord(acquired.handle.recordPath, bytes, record, acquired.handle),
      },
    });
    if (attached.kind === "refused") {
      return { kind: "result", result: refusal(
        "locus-attach", attached.reason, "The adopted role changed before its lease attached.",
      ) };
    }
    const row: LocusRowV1 & { recordId: string; checkoutPath: string } = {
      kind: "managed-role",
      checkoutPath,
      primary: lockedCheckout.primary,
      recordId: recordId.recordId,
      role: attached.record.role,
      identity: adoption.identity,
      lease: attached.record.lease === null ? null : {
        ...attached.record.lease,
        state: anchor.kind === "process" ? "live" : "unknown",
        // This row is the lease this invocation just attached under its own anchor.
        selfHeld: anchor.kind === "process",
      },
      frame: anchor.kind === "process" ? "active" : "residue",
      derived: null,
      diagnostics: [],
    };
    return { kind: "result", result: success("locus-attach", "applied", row, attached.record.lease?.leaseId ?? null) };
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function deriveRuntimeAdoption(options: {
  options: LocusCommandRuntimeOptions;
  checkout: RegisteredWorktree;
  marker: WorktreeMarkerGenerationReadResult;
  identities: Awaited<ReturnType<typeof readTransientIdentitySnapshot>>;
  recordId: string;
  recordPath: string;
}): Promise<{ authority: LocusRoleAuthority; identity: LocusRowV1["identity"] } | null> {
  const transient = deriveTransientAdoptionCandidate({
    identity: options.options.identity,
    checkout: options.checkout,
    marker: options.marker,
    identities: options.identities,
    recordId: options.recordId,
    recordPath: options.recordPath,
  });
  if (transient?.kind === "applicable" && transient.action === "adopt-transient") {
    return {
      authority: { kind: "identity", identity: transient.authority.identity },
      identity: transient.authority.identity,
    };
  }
  const subjectKey = await deriveWorkUnitSubject(options.options, options.checkout, options.marker);
  return subjectKey === null
    ? null
    : { authority: { kind: "work-unit", key: subjectKey }, identity: null };
}

async function deriveWorkUnitSubject(
  options: LocusCommandRuntimeOptions,
  checkout: RegisteredWorktree,
  marker: WorktreeMarkerGenerationReadResult,
): Promise<string | null> {
  if (checkout.branch === null || checkout.detached) return null;
  let markerSubject: string | null = null;
  if (marker.kind === "present") {
    const ownership = decodeWorktreeMarkerOwnership(marker.marker);
    if (marker.marker.spawningIdentity !== options.identity
      || ownership.kind !== "current"
      || ownership.subject.kind !== "work-unit") return null;
    markerSubject = ownership.subject.name;
  } else if (!checkout.primary) return null;

  const roots = [
    join(checkout.path, ".arc", "active"),
    join(checkout.path, ".arc", "user", options.identity, "active"),
  ];
  const candidates = (await Promise.all(roots.map(async (root) => {
    const names = await readdir(root).catch(() => [] as string[]);
    return Promise.all(names.filter((name) => /^meta-.*\.md$/u.test(name)).map(async (name) => {
      try {
        const record = parseMetaRecord(await readFile(join(root, name), "utf8"));
        return { name: name.slice("meta-".length, -".md".length), record };
      } catch {
        return null;
      }
    }));
  }))).flat().filter((candidate) => candidate !== null
    && candidate.record.owner === options.identity
    && candidate.record.branch === checkout.branch
    && ["Planning", "Active", "Integrating"].includes(candidate.record.state ?? "")
    && (markerSubject === null || candidate.name === markerSubject));
  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  return candidate?.name ?? null;
}

/** Release only the caller-named lease generation while retaining its durable role. */
export async function releaseLocusAtRuntime(
  options: LocusCommandRuntimeOptions & { readonly leaseId: string },
): Promise<LocusMutationResultV1> {
  const prepared = await prepare(options, "locus-release");
  if (prepared.kind === "result") return prepared.result;
  const { runtime, row, checkoutPath } = prepared;
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") return lockRefusal("locus-release", acquired.reason);
  try {
    const released = await releaseLocusLease({
      recordId: row.recordId,
      leaseId: options.leaseId,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        replace: (bytes, record) => runtime.replaceRecord(acquired.handle.recordPath, bytes, record, acquired.handle),
      },
    });
    if (released.kind === "refused") return refusal("locus-release", released.reason, "The named lease generation cannot be released.");
    return success("locus-release", released.kind, row, null);
  } catch (error) {
    return failure("locus-release", error);
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

/** Resolve one exact dead transient role through reattach or its subject abandonment driver. */
export async function resolveLocusAtRuntime(options: ResolveLocusRuntimeOptions): Promise<LocusMutationResultV1> {
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return refusal("locus-resolve", "lease-unknown", anchor.reason);
  const inspector = createPlatformProcessInspector();
  const state = await readCommandLocusState(options, anchor, inspector);
  const matches = state.roster.rows.filter((row) => row.recordId === options.recordId);
  const row = matches.length === 1 ? matches[0] : undefined;
  if (row === undefined) return refusal("locus-resolve", matches.length > 1 ? "duplicate-locus" : "checkout-missing", "Select one exact session locus record generation.");
  const checkoutClean = row.checkoutPath !== null
    && (await options.io.exec("git", ["status", "--porcelain"], { cwd: row.checkoutPath })).stdout === "";
  return resolveLocusGeneration({
    row, action: options.action, checkoutClean,
    confirmedNoLiveSession: options.confirmedNoLiveSession,
    dependencies: {
      run: async (dispatch) => dispatch.action === "abandon"
        ? options.abandon(dispatch)
        : resumeDeadAtRuntime(options, row, anchor, inspector),
    },
  });
}

async function resumeDeadAtRuntime(
  options: ResolveLocusRuntimeOptions,
  row: LocusRowV1,
  anchor: Extract<Awaited<ReturnType<typeof acquireSessionAnchor>>, { kind: "process" }>,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusMutationResultV1> {
  if (row.checkoutPath === null || row.recordId === null || row.lease === null) {
    return refusal("locus-resolve", "record-malformed", "The dead transient generation is incomplete.");
  }
  const runtime = createNodeProvisioningDependencies({
    exec: options.io.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: row.identity?.branch ?? null, postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(row.checkoutPath);
  if (acquired.kind !== "acquired") return lockRefusal("locus-resolve", acquired.reason);
  try {
    const now = new Date().toISOString();
    const resumed = await resumeDeadTransientLease({
      recordId: row.recordId, expectedLeaseId: row.lease.leaseId,
      sessionHomePath: row.checkoutPath, anchor, attachedAt: now, heartbeatAt: now,
      observedLiveness: row.lease.state,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        replace: (bytes, record) => runtime.replaceRecord(acquired.handle.recordPath, bytes, record, acquired.handle),
      },
    });
    if (resumed.kind === "refused") return refusal("locus-resolve", resumed.reason, "The dead transient generation changed before resume.");
    return createLocusMutationResult({
      outcome: resumed.kind, operation: "locus-resolve", allocation: null,
      recordId: row.recordId, leaseId: resumed.record.lease?.leaseId ?? null,
      activeLocusPath: row.checkoutPath, sessionHomePath: row.checkoutPath,
      identity: row.identity, originEntry: row.role?.originEntry ?? null,
      restoredParent: null, nextOffer: null,
      recommendedPromptText: `Resumed the exact dead transient generation at ${row.checkoutPath}.`,
    });
  } finally {
    await runtime.releaseRecordLock(acquired.handle);
  }
}

async function prepare(
  options: LocusCommandRuntimeOptions,
  operation: "locus-attach" | "locus-release",
): Promise<
  | { kind: "result"; result: LocusMutationResultV1 }
  | {
      kind: "ready";
      row: LocusRowV1 & { recordId: string; checkoutPath: string };
      checkoutPath: string;
      anchor: LocusAnchor;
      inspector: ReturnType<typeof createPlatformProcessInspector>;
      runtime: ReturnType<typeof createNodeProvisioningDependencies>;
    }
> {
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  const inspector = createPlatformProcessInspector();
  const state = await readCommandLocusState(options, anchor, inspector);
  const target = options.checkout === undefined ? null : resolve(options.cwd, options.checkout);
  const addressed = state.roster.rows.filter((row) =>
    (target === null || row.checkoutPath === target)
    && (options.recordId === undefined || row.recordId === options.recordId));

  // An explicitly addressed row is reported on its own terms: the operator named one checkout or
  // record, so an untrusted match must say why rather than read as "nothing matched".
  let selected: TrustedLocusRow | undefined;
  if (target !== null || options.recordId !== undefined) {
    const only = addressed.length === 1 ? addressed[0] : undefined;
    if (only === undefined) {
      return { kind: "result", result: refusal(
        operation,
        addressed.length === 0 ? "checkout-missing" : "duplicate-locus",
        addressed.length === 0
          ? "No session locus role is registered at the requested checkout."
          : "More than one session locus role matches the requested checkout.",
      ) };
    }
    const trusted = projectTrustedLocusRow(only);
    if (trusted.kind !== "trusted") {
      return { kind: "result", result: refusal(
        operation,
        untrustedRefusalReason(trusted.reasons),
        `The requested checkout's session locus role is not trusted: ${trusted.reasons.join(", ")}.`,
      ) };
    }
    selected = trusted.value;
  } else {
    const trusted = trustedLocusRows(addressed);
    const activeRecordId = state.current.kind === "resolved" ? state.current.activeRecordId : null;
    selected = activeRecordId !== null
      ? trusted.find((entry) => entry.recordId === activeRecordId)
      : trusted.length === 1 ? trusted[0] : undefined;
  }
  if (selected === undefined) {
    return { kind: "result", result: refusal(operation, "role-conflict", "Select one trusted managed checkout.") };
  }
  const runtime = createNodeProvisioningDependencies({
    exec: options.io.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: selected.row.identity?.branch ?? null, postCreateScript: options.postCreateScript,
    registeredHarnessDirs: options.registeredHarnessDirs,
  });
  return {
    kind: "ready",
    row: { ...selected.row, recordId: selected.recordId, checkoutPath: selected.checkoutPath },
    checkoutPath: selected.checkoutPath, anchor, inspector, runtime,
  };
}

function success(
  operation: "locus-attach" | "locus-release",
  outcome: "applied" | "idempotent",
  row: LocusRowV1 & { recordId: string; checkoutPath: string },
  leaseId: string | null,
): LocusMutationResultV1 {
  const result = createLocusMutationResult({
    outcome, operation, allocation: null, recordId: row.recordId, leaseId,
    activeLocusPath: operation === "locus-attach" ? row.checkoutPath : null,
    sessionHomePath: operation === "locus-attach" ? row.checkoutPath : null,
    identity: row.identity, originEntry: row.role?.originEntry ?? null,
    restoredParent: null, nextOffer: null,
    recommendedPromptText: operation === "locus-attach"
      ? `Attached the entering session to ${row.checkoutPath}.`
      : `Released the exact lease for ${row.checkoutPath}.`,
  });
  return operation === "locus-attach"
    ? appendDirectedCommandAdvisory(result, { confirmationRequired: true })
    : result;
}

function lockRefusal(
  operation: "locus-attach" | "locus-release" | "locus-resolve",
  reason: "live" | "unknown" | "timeout",
): LocusMutationResultV1 {
  return refusal(operation, reason === "live" ? "lease-live" : "lease-unknown", "The session locus record lock is unavailable.");
}

function refusal(
  operation: "locus-attach" | "locus-release" | "locus-resolve",
  reason: LocusRefusalReason,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation, reason, recommendedPromptText: text });
}

function failure(operation: "locus-attach" | "locus-release" | "locus-resolve", error: unknown): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation,
    error: { code: locusErrorCode(operation, "failed"), message: error instanceof Error ? error.message : String(error) },
    recommendedPromptText: "Inspect the exact session locus record and retry.",
  });
}
