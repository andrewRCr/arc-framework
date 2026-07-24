/**
 * Identity-global user-reference reconciliation.
 *
 * Only exact `WU_Target` fields in USER-INBOX Work Unit entries are mechanical.
 * Other current user surfaces produce read-only prose findings. The module keeps
 * planning pure and exposes a lock-bound apply seam that re-reads before write.
 *
 * @module
 */

import {
  enumerateReferenceTransitions,
  resolveReferenceTransition,
  type ReachableReferenceTransition,
  type ReferenceTransitionResolution,
} from "./work-unit/reference-reconcile.js";
import type { RetirementRecordEnumerationResult } from "./work-unit/retirement-record-enumeration.js";

/** One exact user-surface snapshot. */
export interface UserReferenceSurface {
  path: string;
  content: string;
}

/** One managed target replacement. */
export interface UserReferenceReplacement {
  subject: string;
  targetSlug: string;
}

/** One atomic disk edit; only USER-INBOX is eligible. */
export interface UserReferenceEdit {
  path: string;
  content: string;
  replacements: readonly UserReferenceReplacement[];
}

/** One non-mutating user-reference finding. */
export interface UserReferenceAdvisory {
  path: string;
  line: number;
  context: string;
  subject: string;
  kind: "prose" | "terminal" | "conflict";
  disposition: "review-rename" | "remove-or-retarget" | "inspect-history";
}

/** Complete read-only or apply-ready user-reference plan. */
export interface UserReferenceReconcilePlan {
  status: "clean" | "pending" | "advisory";
  edits: readonly UserReferenceEdit[];
  advisories: readonly UserReferenceAdvisory[];
}

/** Pure planner inputs over the three permitted current user surfaces. */
export interface PlanUserReferenceReconcileInput {
  transitions: readonly ReachableReferenceTransition[];
  userInbox: UserReferenceSurface;
  workingMemory?: UserReferenceSurface;
  sessionNotes?: UserReferenceSurface;
}

/** Lock-bound I/O seams for the dedicated user-reference operation. */
export interface UserReferenceReconcileContext {
  transitions: readonly ReachableReferenceTransition[];
  apply: boolean;
  readSurfaces: () => Promise<Omit<PlanUserReferenceReconcileInput, "transitions">>;
  acquireLock: () => Promise<unknown>;
  releaseLock: (handle: unknown) => Promise<void>;
  atomicWrite: (path: string, content: string) => Promise<void>;
}

/** Closed dedicated operation result. */
export type UserReferenceReconcileResult =
  | { status: "clean" | "pending" | "advisory"; plan: UserReferenceReconcilePlan }
  | { status: "applied"; plan: UserReferenceReconcilePlan; writtenPaths: readonly string[] };

/** Authority adapters for protection-aware base discovery. */
export interface UserReferenceAuthorityContext {
  protection: "full" | "partial";
  baseBranch: string;
  refreshRemoteBase: () => Promise<boolean>;
  enumerateAt: (ref: string) => Promise<RetirementRecordEnumerationResult>;
}

/** Protection-aware transition authority result. */
export type UserReferenceAuthorityResult =
  | { status: "ready"; ref: string; transitions: readonly ReachableReferenceTransition[] }
  | { status: "unavailable"; ref: string }
  | { status: "conflict"; ref: string; reason: "version-conflict" | "namespace-corrupt" };

/** Read-only session projection with CLI-owned dispatch. */
export interface UserReferenceReconcileSessionResult {
  status: "clean" | "pending" | "advisory" | "unavailable" | "conflict";
  authority: UserReferenceAuthorityResult;
  plan: UserReferenceReconcilePlan | null;
  recommendedAction: "skip" | "apply" | "surface";
  recommendedCommand: readonly string[] | null;
  recommendedPromptText: string;
}

const MANAGED_TARGET = /^- _WU_Target:_ `([a-z0-9]+(?:-[a-z0-9]+)*)( \((?:planned|provisional)\))?`$/u;
const SLUG_CHAR = /[a-z0-9-]/u;

/**
 * Plan exact managed edits and advisory-only current-user findings.
 *
 * @param input - Base-authoritative transitions and permitted disk snapshots
 * @returns A deterministic plan that never includes sibling WU workspaces
 */
export function planUserReferenceReconcile(
  input: PlanUserReferenceReconcileInput,
): UserReferenceReconcilePlan {
  const advisories: UserReferenceAdvisory[] = [];
  const replacements: UserReferenceReplacement[] = [];
  let inWorkUnit = false;
  const lines = input.userInbox.content.split("\n");
  const rewritten = lines.map((line, index) => {
    if (line.startsWith("## ")) inWorkUnit = line === "## Work Unit";
    if (!inWorkUnit) return line;
    const match = MANAGED_TARGET.exec(line);
    const subject = match?.[1];
    if (subject === undefined) return line;
    const resolution = resolveReferenceTransition(input.transitions, subject);
    if (resolution.kind === "rename") {
      replacements.push({ subject, targetSlug: resolution.targetSlug });
      return `- _WU_Target:_ \`${resolution.targetSlug}${match?.[2] ?? ""}\``;
    }
    if (resolution.kind !== "absent") {
      advisories.push(managedAdvisory(input.userInbox, index + 1, line, subject, resolution));
    }
    return line;
  }).join("\n");

  for (const surface of [input.workingMemory, input.sessionNotes]) {
    if (surface === undefined) continue;
    advisories.push(...scanProse(surface, input.transitions));
  }
  const edits: UserReferenceEdit[] = rewritten === input.userInbox.content
    ? []
    : [{
        path: input.userInbox.path,
        content: rewritten,
        replacements: uniqueReplacements(replacements),
      }];
  return {
    status: edits.length > 0 ? "pending" : advisories.length > 0 ? "advisory" : "clean",
    edits,
    advisories: advisories.sort(compareAdvisories),
  };
}

/**
 * Inspect or apply user-reference repairs, re-reading after lock acquisition.
 *
 * @param ctx - Authority transitions, disk snapshots, lock, and atomic writer
 * @returns Read-only plan or the exact atomically written disk paths
 */
export async function runUserReferenceReconcile(
  ctx: UserReferenceReconcileContext,
): Promise<UserReferenceReconcileResult> {
  const inspected = planUserReferenceReconcile({
    transitions: ctx.transitions,
    ...await ctx.readSurfaces(),
  });
  if (!ctx.apply || inspected.edits.length === 0) return { status: inspected.status, plan: inspected };

  const handle = await ctx.acquireLock();
  try {
    const current = planUserReferenceReconcile({
      transitions: ctx.transitions,
      ...await ctx.readSurfaces(),
    });
    if (current.edits.length === 0) return { status: current.status, plan: current };
    for (const edit of current.edits) await ctx.atomicWrite(edit.path, edit.content);
    return {
      status: "applied",
      plan: current,
      writtenPaths: current.edits.map(({ path }) => path),
    };
  } finally {
    await ctx.releaseLock(handle);
  }
}

/**
 * Read transitions only from the protection-aware integrating base.
 *
 * @param ctx - Protection mode, base identity, refresh, and enumeration seams
 * @returns Strict remote-base authority under full protection; local base under partial
 */
export async function resolveUserReferenceAuthority(
  ctx: UserReferenceAuthorityContext,
): Promise<UserReferenceAuthorityResult> {
  const ref = ctx.protection === "full" ? `origin/${ctx.baseBranch}` : ctx.baseBranch;
  if (ctx.protection === "full" && !await ctx.refreshRemoteBase()) {
    return { status: "unavailable", ref };
  }
  let enumeration: RetirementRecordEnumerationResult;
  try {
    enumeration = await ctx.enumerateAt(ref);
  } catch {
    return { status: "unavailable", ref };
  }
  const projected = enumerateReferenceTransitions(enumeration);
  return projected.status === "valid"
    ? { status: "ready", ref, transitions: projected.transitions }
    : { status: "conflict", ref, reason: projected.reason };
}

/**
 * Project authority and current disk surfaces into the read-only session slot.
 *
 * @param authority - Protection-aware base authority result
 * @param surfaces - Current permitted user surfaces
 * @returns Typed findings plus a precomposed dedicated-command argv
 */
export function projectUserReferenceSessionResult(
  authority: UserReferenceAuthorityResult,
  surfaces: Omit<PlanUserReferenceReconcileInput, "transitions">,
): UserReferenceReconcileSessionResult {
  if (authority.status !== "ready") {
    return {
      status: authority.status,
      authority,
      plan: null,
      recommendedAction: "surface",
      recommendedCommand: null,
      recommendedPromptText:
        `User-reference reconcile cannot establish ${authority.ref} authority (${authority.status}).`,
    };
  }
  const plan = planUserReferenceReconcile({ transitions: authority.transitions, ...surfaces });
  if (plan.status === "clean") {
    return {
      status: "clean",
      authority,
      plan,
      recommendedAction: "skip",
      recommendedCommand: null,
      recommendedPromptText: "",
    };
  }
  if (plan.edits.length > 0) {
    return {
      status: "pending",
      authority,
      plan,
      recommendedAction: "apply",
      recommendedCommand: ["arc", "user", "reconcile-references", "--apply", "--json"],
      recommendedPromptText:
        "Managed USER-INBOX references can be reconciled from authoritative rename evidence.",
    };
  }
  return {
    status: "advisory",
    authority,
    plan,
    recommendedAction: "surface",
    recommendedCommand: ["arc", "user", "reconcile-references", "--json"],
    recommendedPromptText: `User-reference reconcile found ${plan.advisories.length} advisory reference(s).`,
  };
}

function managedAdvisory(
  surface: UserReferenceSurface,
  line: number,
  context: string,
  subject: string,
  resolution: Exclude<ReferenceTransitionResolution, { kind: "rename" } | { kind: "absent" }>,
): UserReferenceAdvisory {
  return {
    path: surface.path,
    line,
    context,
    subject,
    kind: resolution.kind === "conflict" ? "conflict" : "terminal",
    disposition: resolution.kind === "conflict" ? "inspect-history" : "remove-or-retarget",
  };
}

function scanProse(
  surface: UserReferenceSurface,
  transitions: readonly ReachableReferenceTransition[],
): UserReferenceAdvisory[] {
  const subjects = [...new Set(transitions.map(({ subject }) => subject))].sort(byteSort);
  const advisories: UserReferenceAdvisory[] = [];
  for (const subject of subjects) {
    const resolution = resolveReferenceTransition(transitions, subject);
    for (const offset of slugOffsets(surface.content, subject)) {
      const before = surface.content.slice(0, offset);
      const line = before.split("\n").length;
      const start = before.lastIndexOf("\n") + 1;
      const end = surface.content.indexOf("\n", offset);
      advisories.push({
        path: surface.path,
        line,
        context: surface.content.slice(start, end === -1 ? undefined : end).trim(),
        subject,
        kind: resolution.kind === "conflict" ? "conflict" : resolution.kind === "rename" ? "prose" : "terminal",
        disposition: resolution.kind === "conflict"
          ? "inspect-history"
          : resolution.kind === "rename"
            ? "review-rename"
            : "remove-or-retarget",
      });
    }
  }
  return advisories;
}

function slugOffsets(content: string, slug: string): number[] {
  const offsets: number[] = [];
  let offset = content.indexOf(slug);
  while (offset !== -1) {
    const before = offset === 0 ? "" : content[offset - 1] ?? "";
    const after = content[offset + slug.length] ?? "";
    if (!SLUG_CHAR.test(before) && !SLUG_CHAR.test(after)) offsets.push(offset);
    offset = content.indexOf(slug, offset + slug.length);
  }
  return offsets;
}

function uniqueReplacements(replacements: readonly UserReferenceReplacement[]): UserReferenceReplacement[] {
  const seen = new Set<string>();
  return replacements.filter(({ subject, targetSlug }) => {
    const signature = `${subject}\0${targetSlug}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function compareAdvisories(left: UserReferenceAdvisory, right: UserReferenceAdvisory): number {
  return byteSort(left.path, right.path)
    || left.line - right.line
    || byteSort(left.subject, right.subject);
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
