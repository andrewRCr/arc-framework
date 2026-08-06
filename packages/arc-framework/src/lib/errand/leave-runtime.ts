/** Production identity, preservation, and derived-occupancy composition for Errand leave. */

import type { GitExec, GitExecInput } from "../git/exec.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import { observeExactChangeRequest } from "./change-request-lifecycle.js";
import {
  authorizeErrandTerminal,
  type ErrandTerminalAuthority,
  type ErrandTerminalSubject,
} from "./terminal-authority.js";
import {
  createTerminalOccupancyIO,
  settleTerminalOccupancy,
} from "./terminal-occupancy.js";
import {
  leaveOrdinaryErrand,
  type LeaveAuthorization,
  type LeaveCleanupResult,
} from "./leave.js";
import { ordinaryErrandTransform, provePauseHead, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";

export interface LeaveOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly state: "paused" | "awaiting-merge";
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly updatedAt: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly readFrame: () => Promise<DerivedLocusFrame>;
  readonly confirmForeignGeneration?: string;
}

/** Run one ordinary Errand leave from identity and derived checkout authority. */
export async function leaveOrdinaryErrandAtRuntime(
  options: LeaveOrdinaryErrandRuntimeOptions,
): ReturnType<typeof leaveOrdinaryErrand> {
  if (options.protection !== "full") {
    return leaveOrdinaryErrand({ ...options, dependencies: inertDependencies() });
  }
  const identityIO = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const occupancyIO = createTerminalOccupancyIO(options.exec, { restorePrimaryTo: options.base });

  return leaveOrdinaryErrand({
    slug: options.slug,
    state: options.state,
    protection: options.protection,
    updatedAt: options.updatedAt,
    dependencies: {
      readIdentity: () => transactTransientIdentities(identityIO, {
        remote: "origin",
        message: `arc: reconcile errand identity ${options.slug}`,
        transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
      }),
      authorize: (record) => authorizePreservation(options, record, occupancyIO),
      persist: (transition) => transactTransientIdentities(identityIO, {
        remote: "origin",
        message: `arc: leave errand ${options.slug} ${options.state}`,
        transform: ordinaryErrandTransform(transition),
      }),
      cleanup: async (record) => {
        const authority = await readAuthority(options, record);
        if (authority.kind !== "authorized") return authorityFailure(authority);
        const primaryCheckoutPath = primaryPath(await options.readFrame());
        if (primaryCheckoutPath === null) {
          return { kind: "refused", reason: "checkout-missing", message: "Primary checkout is unavailable." };
        }
        const settled = await settleTerminalOccupancy({ authority, primaryCheckoutPath, io: occupancyIO });
        if (settled.kind === "refused") {
          return { kind: "refused", reason: "preservation-unproven", message: settled.message };
        }
        if (settled.kind === "error") {
          return { kind: "error", code: "locus.errand-leave.cleanup", message: settled.message };
        }
        return {
          kind: settled.kind,
          parentCheckoutPath: settled.parentCheckoutPath,
        };
      },
    },
  });
}

function inertDependencies(): Parameters<typeof leaveOrdinaryErrand>[0]["dependencies"] {
  const unavailable = () => Promise.reject(new Error("partial leave has no identity authority"));
  return { readIdentity: unavailable, authorize: unavailable, persist: unavailable, cleanup: unavailable };
}

async function authorizePreservation(
  options: LeaveOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  occupancyIO: ReturnType<typeof createTerminalOccupancyIO>,
): Promise<LeaveAuthorization> {
  const authority = await readAuthority(options, record);
  if (authority.kind !== "authorized") return authorityFailure(authority);
  if (authority.row === null || authority.checkoutPath === null) {
    return { kind: "refused", reason: "checkout-missing", message: "Open Errand checkout is absent." };
  }
  const inspected = await occupancyIO.inspect(authority.checkoutPath);
  if (inspected.dirty || inspected.branch !== record.branch || inspected.head !== authority.row.checkout.head) {
    return {
      kind: "refused",
      reason: "preservation-unproven",
      message: "Errand checkout is dirty, moved, or off its exact branch head.",
    };
  }
  const proof = await provePauseHead(options.exec, {
    remote: "origin",
    branch: record.branch,
    savedHead: inspected.head,
  });
  if (proof.kind === "refused") {
    return { kind: "refused", reason: "preservation-unproven", message: proof.reason };
  }
  if (proof.kind === "error") {
    return { kind: "error", code: `locus.errand-leave.${proof.stage}`, message: proof.message };
  }
  if (options.state === "paused") {
    return {
      kind: "authorized",
      transition: {
        kind: "pause",
        previous: record,
        savedHead: inspected.head,
        evidence: proof.evidence,
        updatedAt: options.updatedAt,
      },
    };
  }
  const observed = await observeExactChangeRequest(options.exec, record.branch, options.base, inspected.head);
  if (observed.kind !== "observed") {
    return { kind: "refused", reason: "change-request-unverifiable", message: observed.message };
  }
  return {
    kind: "authorized",
    transition: {
      kind: "await-merge",
      previous: record,
      changeRequest: observed.changeRequest,
      configured: observed.configured,
      observed: observed.changeRequest,
      updatedAt: options.updatedAt,
    },
  };
}

async function readAuthority(
  options: LeaveOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
): Promise<ErrandTerminalAuthority> {
  const subject: ErrandTerminalSubject = { kind: "errand", slug: record.slug, claimId: record.claimId };
  return authorizeErrandTerminal({
    frame: await options.readFrame(),
    operation: "leave",
    subject,
    confirmForeignGeneration: options.confirmForeignGeneration,
    retryArguments: ["--state", options.state],
  });
}

function authorityFailure(
  authority: Exclude<ErrandTerminalAuthority, { kind: "authorized" }>,
): Extract<LeaveAuthorization | LeaveCleanupResult, { kind: "refused" }> {
  return {
    kind: "refused",
    reason: authority.kind === "confirmation-required" ? "role-conflict" : "identity-conflict",
    message: authority.kind === "confirmation-required" ? authority.recommendedPromptText : authority.message,
  };
}

function primaryPath(frame: DerivedLocusFrame): string | null {
  return frame.roster.find((row) => row.checkout.primary)?.checkout.path ?? null;
}
