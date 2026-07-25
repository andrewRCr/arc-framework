/** Single-flight housekeeping claim and locus provisioning. */

import { access, lstat, readFile, realpath } from "node:fs/promises";

import type { UserIOContext } from "../../commands/user/types.js";
import type { GitExecInput } from "../git/exec.js";
import { mintClaimId, projectLocusIdentity, TransientIdentityRecordV3Schema } from "../errand/identity-record.js";
import {
  housekeepClaimTransform,
  rollbackIdentityClaim,
  type HousekeepIdentityRecord,
} from "../errand/identity-claims.js";
import { transactTransientIdentities } from "../errand/identity-transaction.js";
import { planLocusAllocation } from "../locus/allocator.js";
import { appendDirectedCommandAdvisory } from "../locus/entry-boundary.js";
import { createLocusEvidenceIO } from "../locus/evidence.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../locus/platform-inspectors.js";
import { acquireSessionAnchor } from "../locus/process-inspector.js";
import { readPrimarySafety } from "../locus/primary-safety.js";
import { provisionTransientLocus } from "../locus/provisioning.js";
import { createNodeProvisioningDependencies } from "../locus/provisioning-runtime.js";
import { readLocusState } from "../locus/reader.js";
import {
  type LocusAnchor,
  type LocusMutationResultV1,
  type LocusRowV1,
  type LocusStateV1,
  type LocusStopReason,
  locusErrorCode,
  type LocusErrorStage,
} from "../locus/schema/index.js";
import { projectTrustedLocusRow, untrustedRefusalReason, type TrustedLocusRow } from "../locus/trusted-row.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";

export interface OpenHousekeepRuntimeOptions {
  readonly slug: string;
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
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  const inspector = createPlatformProcessInspector();
  let state = await readHousekeepState(options, anchor, inspector);

  let record: HousekeepIdentityRecord | null = null;
  let claimApplied = false;
  if (options.protection === "full") {
    const parsed = TransientIdentityRecordV3Schema.safeParse({
      version: 3, kind: "errand", purpose: "housekeep-routing", slug: options.slug,
      claimId: mintClaimId(), createdAt: now, updatedAt: now, branch: `chore/${options.slug}`,
      state: "open", savedHead: null, changeRequest: null,
    });
    if (!parsed.success || parsed.data.kind !== "errand" || parsed.data.purpose !== "housekeep-routing") {
      return failure("claim", "Housekeeping identity request is invalid.");
    }
    const claimed = await transactTransientIdentities(identityIO(options), {
      remote: "origin", message: `arc: open housekeep ${options.slug}`,
      transform: housekeepClaimTransform(parsed.data),
    });
    if (claimed.kind === "error") return failure(`identity-${claimed.stage}`, claimed.message);
    if (claimed.kind === "refused") return refusal("identity-conflict", claimed.reason);
    record = claimed.value.record;
    claimApplied = claimed.kind === "applied" && claimed.value.kind === "claimed";
    state = claimApplied ? state : await readHousekeepState(options, anchor, inspector);
    const existing = exactHousekeepRow(state, record);
    // No rollback on the untrusted arm: the occupancy exists, only its authority is unestablished,
    // and retiring the identity would strand it. A freshly applied claim cannot match a pre-claim
    // roster read, so this arm always names a pre-existing generation.
    if (existing.kind === "untrusted") {
      return refusal(
        untrustedRefusalReason(existing.reasons),
        `Housekeeping occupancy for \`${options.slug}\` is not trusted: ${existing.reasons.join(", ")}.`,
      );
    }
    if (existing.kind === "trusted") {
      const { row, checkoutPath, recordId } = existing.value;
      return success(
        "idempotent", record, checkoutPath, row.lease?.sessionHomePath ?? checkoutPath,
        recordId, row.lease?.leaseId ?? null,
        row.primary === true ? "primary" : "spawned",
      );
    }
    if (claimed.value.kind === "wait") {
      return refusal(
        "identity-conflict",
        "Housekeeping change request is awaiting merge; finalize or abandon that generation before reopening.",
      );
    }
  } else {
    const existing = exactPartialHousekeepRow(state, options.slug);
    if (existing.kind === "untrusted") {
      return refusal(
        untrustedRefusalReason(existing.reasons),
        `Housekeeping occupancy for \`${options.slug}\` is not trusted: ${existing.reasons.join(", ")}.`,
      );
    }
    if (existing.kind === "trusted") {
      const { row, checkoutPath, recordId } = existing.value;
      return success(
        "idempotent", null, checkoutPath, row.lease?.sessionHomePath ?? checkoutPath,
        recordId, row.lease?.leaseId ?? null,
        "primary",
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
    if (record !== null && claimApplied) await rollbackClaim(options, record);
    return refusal(proposal.reason, `Housekeeping allocation refused: ${proposal.reason}.`);
  }
  const activeRecordId = state.current.kind === "resolved" ? state.current.activeRecordId : null;
  const parentCheckoutPath = activeRecordId === null
    ? null
    : state.roster.rows.find((row) => row.recordId === activeRecordId && row.role?.kind === "work-unit")
      ?.checkoutPath ?? null;
  const sessionHomePath = parentCheckoutPath ?? state.roster.primaryPath;
  const provisioned = await provisionTransientLocus({
    proposal, protection: options.protection,
    identity: record === null ? null : projectLocusIdentity(record),
    ...(record === null ? { authority: {
      kind: "partial-housekeep" as const, key: options.slug,
    } } : {}),
    branch: record?.branch ?? null, expectedBranchHead: null, base: options.base,
    locationTemplate: options.locationTemplate, repo: options.repo, spawningIdentity: options.identity,
    parentCheckoutPath, sessionHomePath, establishedAt: now, anchor,
    leaseId: crypto.randomUUID().replaceAll("-", ""),
    dependencies: createNodeProvisioningDependencies({
      exec: options.io.exec, identity: options.identity, anchor, inspector,
      pathFlavor: process.platform === "win32" ? "windows" : "posix", base: options.base,
      branch: record?.branch ?? null, postCreateScript: options.postCreateScript,
      registeredHarnessDirs: options.registeredHarnessDirs,
    }),
  });
  if (provisioned.kind !== "provisioned") {
    if (record !== null && claimApplied) await rollbackClaim(options, record);
    return provisioned.kind === "error"
      ? failure("provision", provisioned.error.message)
      : refusal(provisioningReason(provisioned.reason), `Housekeeping provisioning refused: ${provisioned.reason}.`);
  }
  return success(
    claimApplied || options.protection === "partial" ? "applied" : "idempotent",
    record, provisioned.receipt.checkoutPath, sessionHomePath,
    provisioned.receipt.record.recordId, provisioned.receipt.leaseToken, provisioned.receipt.allocation,
  );
}

export async function readHousekeepState(
  options: Pick<OpenHousekeepRuntimeOptions, "cwd" | "identity" | "base" | "io">,
  anchor: LocusAnchor,
  inspector: ReturnType<typeof createPlatformProcessInspector>,
): Promise<LocusStateV1> {
  const root = (await resolveUserSurfaceResolver({
    cwd: options.cwd, identity: SlugSchema.parse(options.identity), exec: options.io.exec,
  })).identityGlobalRoot;
  return readLocusState({
    identity: options.identity, pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: options.io.exec, identity: options.identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false), realpath, lstat,
    }, identityGlobalUserDir: root, enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({ primaryPath: path, baseBranch: options.base, exec: options.io.exec }),
  });
}

/**
 * Occupancy for one exact housekeeping subject.
 *
 * `absent` continues to allocation; `untrusted` refuses. Collapsing the two would let provisioning
 * run against occupancy whose authority is unestablished.
 */
export type ExactHousekeepOccupancy =
  | { readonly kind: "absent" }
  | { readonly kind: "trusted"; readonly value: TrustedLocusRow }
  | { readonly kind: "untrusted"; readonly reasons: readonly LocusStopReason[] };

export function exactHousekeepRow(
  state: LocusStateV1,
  record: HousekeepIdentityRecord,
): ExactHousekeepOccupancy {
  return exactOccupancy(state.roster.rows.filter((row) => row.role?.kind === "housekeep"
    && row.role.subject.kind === "errand"
    && row.role.subject.key === record.slug && row.role.subject.claimId === record.claimId));
}

export function exactPartialHousekeepRow(state: LocusStateV1, slug: string): ExactHousekeepOccupancy {
  return exactOccupancy(state.roster.rows.filter((row) => row.role?.kind === "housekeep"
    && row.role.subject.kind === "housekeep"
    && row.role.subject.key === slug && row.role.subject.claimId === null));
}

function exactOccupancy(rows: readonly LocusRowV1[]): ExactHousekeepOccupancy {
  const only = rows.length === 1 ? rows[0] : undefined;
  if (only === undefined) {
    return rows.length === 0 ? { kind: "absent" } : { kind: "untrusted", reasons: ["duplicate-locus"] };
  }
  const trusted = projectTrustedLocusRow(only);
  return trusted.kind === "trusted"
    ? { kind: "trusted", value: trusted.value }
    : { kind: "untrusted", reasons: trusted.reasons };
}

async function rollbackClaim(options: OpenHousekeepRuntimeOptions, record: HousekeepIdentityRecord): Promise<void> {
  await rollbackIdentityClaim(identityIO(options), {
    remote: "origin", message: `arc: roll back housekeep ${options.slug}`, expected: record,
  });
}

function identityIO(options: OpenHousekeepRuntimeOptions) {
  return { exec: options.io.exec, execInput: options.io.execInput, identity: options.identity };
}

function success(
  outcome: "applied" | "idempotent",
  record: HousekeepIdentityRecord | null,
  checkoutPath: string | null,
  sessionHomePath: string | null,
  recordId: string | null,
  leaseId: string | null,
  allocation: "primary" | "spawned",
): LocusMutationResultV1 {
  return appendDirectedCommandAdvisory(createLocusMutationResult({
    outcome, operation: "housekeep-open",
    allocation: checkoutPath === null ? null : { kind: allocation, checkoutPath },
    recordId, leaseId, activeLocusPath: checkoutPath, sessionHomePath,
    identity: record === null ? null : projectLocusIdentity(record), originEntry: null,
    restoredParent: null, nextOffer: null,
    recommendedPromptText: checkoutPath === null ? "Housekeeping sweep is awaiting merge." : `Housekeeping sweep opened at ${checkoutPath}.`,
  }));
}

function refusal(reason: import("../locus/schema/index.js").LocusRefusalReason, text: string): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation: "housekeep-open", reason, recommendedPromptText: text });
}

function failure(suffix: LocusErrorStage, message: string): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error", operation: "housekeep-open", error: { code: locusErrorCode("housekeep-open", suffix), message },
    recommendedPromptText: "Inspect the routing identity and local role before retrying.",
  });
}

function provisioningReason(reason: import("../locus/provisioning.js").ProvisioningRefusalReason): import("../locus/schema/index.js").LocusRefusalReason {
  if (reason === "lock-live") return "lease-live";
  if (reason === "lock-unknown") return "lease-unknown";
  if (reason === "path-collision" || reason === "marker-conflict") return "role-conflict";
  return reason;
}
