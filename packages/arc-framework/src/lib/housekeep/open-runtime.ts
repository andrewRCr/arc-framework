/** Single-flight housekeeping claim, inbox binding, and locus provisioning. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import { runExtensionsSessionInitStatus } from "../../commands/extensions.js";
import { withLockedUserInbox } from "../../commands/user/inbox-mutation.js";
import type { UserIOContext } from "../../commands/user/types.js";
import { mutateInboxEntries, inspectInboxEntry } from "../user-sync/inbox-writer.js";
import type { GitExecInput } from "../git/exec.js";
import { mintClaimId, projectLocusIdentity, TransientIdentityRecordV3Schema } from "../errand/identity-record.js";
import {
  housekeepClaimConflictResolver,
  housekeepClaimTransform,
  mintHousekeepDispatchId,
  rollbackIdentityClaim,
  type HousekeepIdentityRecord,
} from "../errand/identity-claims.js";
import { transactTransientIdentities } from "../errand/identity-transaction.js";
import { planLocusAllocation } from "../locus/allocator.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { createLocusMutationResult, popOwnedLocusRole } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { provisionTransientLocus } from "../locus/provisioning.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import type { LocusMutationResultV1, LocusProcessAnchor, LocusStateV1 } from "../locus/schema/index.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";
import { executePlanEntries, type ParsedHousekeepPlan } from "./plan.js";

export interface OpenHousekeepRuntimeOptions {
  readonly slug: string;
  readonly lane: "auto" | "reviewed";
  readonly plan: ParsedHousekeepPlan;
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly identity: string;
  readonly locationTemplate: string;
  readonly repo: string;
  readonly postCreateScript: string;
  readonly registeredHarnessDirs: string;
  readonly cwd: string;
  readonly io: UserIOContext & { execInput: GitExecInput };
}

/** Open or exactly resume one confirmed routing sweep. */
export async function openHousekeepAtRuntime(options: OpenHousekeepRuntimeOptions): Promise<LocusMutationResultV1> {
  const now = new Date().toISOString();
  const dispatchId = mintHousekeepDispatchId();
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return refusal("cold-entry-required", anchor.reason);
  const inspector = createPlatformProcessInspector();
  const state = await readHousekeepState(options, anchor, inspector);

  let record: HousekeepIdentityRecord | null = null;
  let claimApplied = false;
  let inboxBindingApplied = false;
  if (options.protection === "full") {
    const parsed = TransientIdentityRecordV3Schema.safeParse({
      version: 3, kind: "errand", purpose: "housekeep-routing", slug: options.slug,
      claimId: mintClaimId(), createdAt: now, updatedAt: now, branch: `chore/${options.slug}`,
      routingLane: options.lane, dispatchId, routingPlanDigest: options.plan.digest,
      state: "open", savedHead: null, changeRequest: null,
    });
    if (!parsed.success || parsed.data.kind !== "errand" || parsed.data.purpose !== "housekeep-routing") {
      return failure("claim", "Housekeeping identity request is invalid.");
    }
    const claimed = await transactTransientIdentities(identityIO(options), {
      remote: "origin", message: `arc: open housekeep ${options.slug}`,
      transform: housekeepClaimTransform(parsed.data), resolveConflict: housekeepClaimConflictResolver(parsed.data),
    });
    if (claimed.kind === "error") return failure(`identity-${claimed.stage}`, claimed.message);
    if (claimed.kind === "refused") return refusal(
      claimed.reason.includes("different plan") ? "routing-plan-mismatch" : "identity-conflict",
      claimed.reason,
    );
    record = claimed.value.record;
    claimApplied = claimed.kind === "applied" && claimed.value.kind === "claimed";
    const existing = exactHousekeepRow(state, record);
    if (existing !== null) {
      await bindInbox(options, record.dispatchId);
      return success(
        "idempotent", record, existing.checkoutPath, existing.recordId, existing.lease?.leaseId ?? null,
        existing.primary === true ? "primary" : "spawned", record.dispatchId, record.routingPlanDigest,
      );
    }
    if (!claimApplied) {
      return success(
        "idempotent", record, null, null, null, "spawned", record.dispatchId, record.routingPlanDigest,
      );
    }
    try {
      inboxBindingApplied = await bindInbox(options, record.dispatchId);
    } catch (error) {
      await rollbackClaim(options, record);
      return failure("inbox", error instanceof Error ? error.message : String(error));
    }
  } else {
    const existing = exactPartialHousekeepRow(state, options.slug);
    if (existing !== null) {
      if (existing.role?.routingPlanDigest !== options.plan.digest) {
        return refusal("routing-plan-mismatch", "The live partial housekeeping sweep has a different plan digest.");
      }
      await bindInbox(options, existing.role.dispatchId as string);
      return success(
        "idempotent", null, existing.checkoutPath, existing.recordId, existing.lease?.leaseId ?? null,
        "primary", existing.role.dispatchId as string, existing.role.routingPlanDigest,
      );
    }
  }

  const subject = {
    kind: "housekeep" as const,
    key: options.slug,
    claimId: record?.claimId ?? null,
  };
  const proposal = planLocusAllocation({ state, protection: options.protection, isolation: "prefer-primary", subject });
  if (proposal.kind === "refused") {
    if (inboxBindingApplied && record !== null) await unbindInbox(options, record.dispatchId);
    if (record !== null && claimApplied) await rollbackClaim(options, record);
    return refusal(proposal.reason, `Housekeeping allocation refused: ${proposal.reason}.`);
  }
  const sessionHomePath = state.roster.primaryPath;
  const provisioned = await provisionTransientLocus({
    proposal, protection: options.protection,
    identity: record === null ? null : projectLocusIdentity(record),
    ...(record === null ? { authority: {
      kind: "partial-housekeep" as const, key: options.slug, originEntry: null,
      dispatchId, routingPlanDigest: options.plan.digest,
    } } : {}),
    branch: record?.branch ?? null, expectedBranchHead: null, base: options.base,
    locationTemplate: options.locationTemplate, repo: options.repo, spawningIdentity: options.identity,
    parentCheckoutPath: null, sessionHomePath, establishedAt: now, anchor,
    leaseId: crypto.randomUUID().replaceAll("-", ""),
    dependencies: createNodeProvisioningDependencies({
      exec: options.io.exec, identity: options.identity, anchor, inspector,
      pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
      branch: record?.branch ?? null, postCreateScript: options.postCreateScript,
      registeredHarnessDirs: options.registeredHarnessDirs,
    }),
  });
  if (provisioned.kind !== "provisioned") {
    if (inboxBindingApplied && record !== null) await unbindInbox(options, record.dispatchId);
    if (record !== null && claimApplied) await rollbackClaim(options, record);
    return provisioned.kind === "error"
      ? failure("provision", provisioned.error.message)
      : refusal(provisioningReason(provisioned.reason), `Housekeeping provisioning refused: ${provisioned.reason}.`);
  }
  try {
    if (options.protection === "partial") await bindInbox(options, dispatchId);
  } catch (error) {
    await rollbackProvision(options, provisioned.receipt.checkoutPath, provisioned.receipt.record.recordId,
      provisioned.receipt.leaseToken, subject, anchor, inspector);
    if (record !== null && claimApplied) await rollbackClaim(options, record);
    return failure("inbox", error instanceof Error ? error.message : String(error));
  }
  return success(
    claimApplied ? "applied" : "idempotent", record, provisioned.receipt.checkoutPath,
    provisioned.receipt.record.recordId, provisioned.receipt.leaseToken, provisioned.receipt.allocation,
    record?.dispatchId ?? dispatchId, record?.routingPlanDigest ?? options.plan.digest,
  );
}

async function bindInbox(options: OpenHousekeepRuntimeOptions, dispatchId: string): Promise<boolean> {
  const transaction = await withLockedUserInbox(options, ({ content }) => {
    if (content === null) throw new Error("USER-INBOX is missing");
    for (const entry of options.plan.plan.entries) {
      const actual = inspectInboxEntry(content, entry.title);
      if (actual.sourceDigest !== entry.sourceDigest) throw new Error(`USER-INBOX source digest changed for '${entry.title}'.`);
      if (actual.dispatchId !== null && actual.dispatchId !== dispatchId) {
        throw new Error(`USER-INBOX entry '${entry.title}' belongs to another dispatch.`);
      }
    }
    const mutations = executePlanEntries(options.plan.plan).map((entry) => ({
      kind: "mark" as const, ...entry, dispatchId,
    }));
    const result = mutateInboxEntries(content, mutations);
    return { result: result.changed, ...(result.changed ? { replacement: result.content } : {}) };
  });
  return transaction.result;
}

async function unbindInbox(options: OpenHousekeepRuntimeOptions, dispatchId: string): Promise<void> {
  await withLockedUserInbox(options, ({ content }) => {
    if (content === null) throw new Error("USER-INBOX is missing");
    const mutations = executePlanEntries(options.plan.plan).map((entry) => ({
      kind: "unmark" as const, ...entry, dispatchId,
    }));
    const result = mutateInboxEntries(content, mutations);
    return { result: undefined, ...(result.changed ? { replacement: result.content } : {}) };
  });
}

async function readHousekeepState(
  options: OpenHousekeepRuntimeOptions,
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
  const activeExtensions = await runExtensionsSessionInitStatus({ cwd: options.cwd });
  const root = (await resolveUserSurfaceResolver({
    cwd: options.cwd, identity: SlugSchema.parse(options.identity), exec: options.io.exec,
  })).identityGlobalRoot;
  return readLocusState({
    identity: options.identity, pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: options.io.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false), realpath, lstat,
    }, identityGlobalUserDir: root, activeExtensions: activeExtensions.active, enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({ primaryPath: path, baseBranch: options.base, exec: options.io.exec }),
  });
}

function exactHousekeepRow(state: LocusStateV1, record: HousekeepIdentityRecord) {
  const rows = state.roster.rows.filter((row) => row.role?.subject.kind === "housekeep"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId);
  return rows.length === 1 ? rows[0] ?? null : null;
}

function exactPartialHousekeepRow(state: LocusStateV1, slug: string) {
  const rows = state.roster.rows.filter((row) => row.role?.subject.kind === "housekeep"
    && row.role.subject.key === slug && row.role.subject.claimId === null);
  return rows.length === 1 ? rows[0] ?? null : null;
}

async function rollbackClaim(options: OpenHousekeepRuntimeOptions, record: HousekeepIdentityRecord): Promise<void> {
  await rollbackIdentityClaim(identityIO(options), {
    remote: "origin", message: `arc: roll back housekeep ${options.slug}`, expected: record,
  });
}

async function rollbackProvision(
  options: OpenHousekeepRuntimeOptions,
  checkoutPath: string,
  recordId: string,
  leaseId: string,
  subject: { kind: "housekeep"; key: string; claimId: string | null },
  anchor: LocusProcessAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<void> {
  const runtime = createNodeProvisioningDependencies({
    exec: options.io.exec, identity: options.identity, anchor, inspector,
    pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
    branch: options.protection === "full" ? `chore/${options.slug}` : null,
    postCreateScript: options.postCreateScript, registeredHarnessDirs: options.registeredHarnessDirs,
  });
  const acquired = await runtime.acquireRecordLock(checkoutPath);
  if (acquired.kind !== "acquired") return;
  try {
    await popOwnedLocusRole({
      operation: "housekeep-abandon", recommendedPromptText: "Rolled back housekeeping occupancy.",
      recordId, checkoutPath, expectedSubject: subject, expectedLeaseId: leaseId, enteringAnchor: anchor,
      io: {
        read: () => runtime.readRecord(acquired.handle.recordPath, acquired.handle),
        remove: (bytes) => runtime.removeRecord(acquired.handle.recordPath, bytes, acquired.handle),
      },
    });
  } finally { await runtime.releaseRecordLock(acquired.handle); }
}

function identityIO(options: OpenHousekeepRuntimeOptions) {
  return { exec: options.io.exec, execInput: options.io.execInput, identity: options.identity };
}

function success(
  outcome: "applied" | "idempotent",
  record: HousekeepIdentityRecord | null,
  checkoutPath: string | null,
  recordId: string | null,
  leaseId: string | null,
  allocation: "primary" | "spawned",
  dispatchId: string,
  routingPlanDigest: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome, operation: "housekeep-open",
    allocation: checkoutPath === null ? null : { kind: allocation, checkoutPath },
    recordId, leaseId, activeLocusPath: checkoutPath, sessionHomePath: checkoutPath,
    identity: record === null ? null : projectLocusIdentity(record), originEntry: null,
    dispatchId, routingPlanDigest,
    restoredParent: null, nextOffer: null,
    recommendedPromptText: checkoutPath === null ? "Housekeeping sweep is awaiting merge." : `Housekeeping sweep opened at ${checkoutPath}.`,
  });
}

function refusal(reason: import("../locus/schema/index.js").LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "housekeep-open", reason, recommendedPromptText: text });
}

function failure(suffix: string, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation: "housekeep-open", error: { code: `locus.housekeep-open.${suffix}`, message },
    recommendedPromptText: "Inspect the routing identity, inbox bindings, and local role before retrying.",
  });
}

function provisioningReason(reason: import("../locus/provisioning.js").ProvisioningRefusalReason): import("../locus/schema/index.js").LocusRefusalReason {
  if (reason === "lock-live") return "lease-live";
  if (reason === "lock-unknown") return "lease-unknown";
  if (reason === "path-collision" || reason === "marker-conflict") return "role-conflict";
  return reason;
}
