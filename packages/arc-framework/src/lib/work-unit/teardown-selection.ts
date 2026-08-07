/** Marker- and topology-bound selection for checkout teardown. */

import { resolve } from "node:path";

import type { GitExec } from "../git/exec.js";
import {
  decodeWorktreeMarkerOwnership,
  readWorktreeMarkerGeneration,
  type WorktreeMarkerGenerationReadResult,
  type WorktreeMarkerSubject,
  type WorktreeSubject,
} from "../git/worktree-marker.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktree,
} from "../git/worktree-roster.js";
import { digestBytes } from "../kernel/index.js";

export type TeardownSelectionManualReason =
  | "state-unavailable"
  | "duplicate-checkout"
  | "marker-malformed"
  | "markerless"
  | "cross-identity"
  | "subject-mismatch";

/** Exact target evidence selected before any destructive authorization is composed. */
export interface TeardownSelection {
  readonly kind: "clear";
  readonly checkout: RegisteredWorktree;
  readonly subject: WorktreeSubject;
  readonly markerGeneration: string | null;
}

export type TeardownSelectionDecision =
  | TeardownSelection
  | { readonly kind: "manual"; readonly reason: TeardownSelectionManualReason; readonly message: string };

export interface TeardownSelectionRequest {
  readonly checkoutPath: string;
  readonly subject: WorktreeSubject;
}

export type TeardownSelectionReader = (
  request: TeardownSelectionRequest,
) => Promise<TeardownSelectionDecision>;

/** Bind teardown selection to the live Git roster and exact ownership-marker bytes. */
export function createNodeTeardownSelectionReader(options: {
  readonly exec: GitExec;
  readonly identity: string;
}): TeardownSelectionReader {
  return async (request) => {
    const topology = await scanRegisteredWorktrees(options.exec);
    if (!topology.ok) {
      return manual("state-unavailable", `Teardown topology is unavailable: ${topology.message}.`);
    }
    const checkout = exactCheckout(topology.worktrees, request.checkoutPath);
    if (checkout === null) {
      return manual("duplicate-checkout", "The teardown target does not resolve to one exact roster entry.");
    }
    let marker: WorktreeMarkerGenerationReadResult;
    try {
      marker = await readWorktreeMarkerGeneration(checkout.path);
    } catch (error) {
      return manual("state-unavailable", `The teardown target marker is unavailable: ${message(error)}.`);
    }
    return classifyTeardownSelection({
      checkout,
      marker,
      identity: options.identity,
      subject: request.subject,
    });
  };
}

/** Classify one exact registered checkout without consulting process or retired locus state. */
export function classifyTeardownSelection(options: {
  readonly checkout: RegisteredWorktree;
  readonly marker: WorktreeMarkerGenerationReadResult;
  readonly identity: string;
  readonly subject: WorktreeSubject;
}): TeardownSelectionDecision {
  if (options.marker.kind === "malformed") {
    return manual("marker-malformed", "The teardown target ownership marker is malformed.");
  }
  if (options.marker.kind === "absent") {
    if (!options.checkout.primary) {
      return manual("markerless", "The teardown target has no ARC ownership marker.");
    }
    return {
      kind: "clear",
      checkout: { ...options.checkout },
      subject: options.subject,
      markerGeneration: null,
    };
  }
  if (options.marker.marker.spawningIdentity !== options.identity) {
    return manual("cross-identity", "The teardown target ownership marker belongs to another identity.");
  }
  const ownership = decodeWorktreeMarkerOwnership(options.marker.marker);
  if (ownership.kind !== "current" || !subjectsEqual(ownership.subject, options.subject)) {
    return manual("subject-mismatch", "The teardown target ownership marker belongs to a different subject.");
  }
  return {
    kind: "clear",
    checkout: { ...options.checkout },
    subject: options.subject,
    markerGeneration: digestBytes(options.marker.bytes),
  };
}

/** Compare all selected authority evidence, including exact checkout topology. */
export function teardownSelectionsEqual(left: TeardownSelection, right: TeardownSelection): boolean {
  return resolve(left.checkout.path) === resolve(right.checkout.path)
    && left.checkout.head === right.checkout.head
    && left.checkout.branch === right.checkout.branch
    && left.checkout.detached === right.checkout.detached
    && left.checkout.primary === right.checkout.primary
    && subjectsEqual(left.subject, right.subject)
    && left.markerGeneration === right.markerGeneration;
}

function subjectsEqual(left: WorktreeMarkerSubject, right: WorktreeSubject): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "work-unit" && right.kind === "work-unit") return left.name === right.name;
  if (left.kind === "branch" && right.kind === "branch") return left.ref === right.ref;
  if (left.kind === "errand" && right.kind === "errand") {
    return !("claimId" in left) && left.slug === right.slug;
  }
  return false;
}

function exactCheckout(topology: readonly RegisteredWorktree[], path: string): RegisteredWorktree | null {
  const normalized = resolve(path);
  const matches = topology.filter((entry) => resolve(entry.path) === normalized);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function manual(
  reason: TeardownSelectionManualReason,
  messageText: string,
): Extract<TeardownSelectionDecision, { kind: "manual" }> {
  return { kind: "manual", reason, message: messageText };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
