/**
 * Identity-global user-reference reconciliation.
 *
 * Only exact `WU_Target` fields in USER-INBOX Work Unit entries are mechanical.
 * Other current user surfaces produce read-only prose findings. The module keeps
 * planning pure and exposes a lock-bound apply seam that re-reads before write.
 *
 * @module
 */
import type { z } from "zod";
import { basename } from "node:path";
import { UserReferenceReconcileSessionResultSchema } from "./user-reference-reconcile-schema.js";
import { applyScratchReconcile, planScratchReconcile, type ScratchReconcileInput, type ScratchReconcilePlan } from "./user-reference-scratch.js";
import { readEntryField, targetNamedByLine } from "./store/kinds/entry-fields.js";

import type { Store } from "./store/contract.js";
import type { StoreRecord } from "./store/read.js";
import { sameReference } from "./store/identity.js";
import type { StoreRefusal } from "./store/refusal.js";
import { recordPut } from "./store/lifecycle-write.js";
import { applyPreparedLifecycleWrite, revalidateLifecycleRecords } from "./work-unit/prepared-lifecycle-write.js";
import type { Remedy } from "./store/refusal.js";
import { readStoreUserReferenceTransitions } from "./store/user-reference-authority.js";
import {
  enumerateTransitionReferenceTransitions,
  resolveReferenceTransition,
  type ReachableReferenceTransition,
  type ReferenceTransitionResolution,
} from "./work-unit/reference-reconcile.js";
import type { TransitionRecordEnumerationResult } from "./work-unit/transition-record-enumeration.js";
import type { ObjectAvailabilityResult } from "./git/object-availability.js";
import {
  classifyRemoteFailure,
  type RemoteHeadSnapshotResult,
} from "./git/remote-ref-reader.js";
import type { RemoteFailureReason } from "./kernel/index.js";
import { boundedGitInvocation, type GitExec } from "./git/exec.js";
import { DEFAULT_FETCH_TIMEOUT_MS } from "./git/worktree-sync.js";
import { isGitObjectId } from "./git/object-id.js";
import { isGitProcessError } from "./git/process-error.js";

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
  successors?: readonly string[];
}

/** Complete read-only or apply-ready user-reference plan. */
export interface UserReferenceReconcilePlan {
  scratch?: ScratchReconcilePlan;
  status: "clean" | "pending" | "advisory";
  edits: readonly UserReferenceEdit[];
  advisories: readonly UserReferenceAdvisory[];
}

/** Pure planner inputs over the three permitted current user surfaces. */
export interface PlanUserReferenceReconcileInput {
  scratch?: ScratchReconcilePlan;
  stateOffBranch?: boolean;
  transitions: readonly ReachableReferenceTransition[];
  userInbox: UserReferenceSurface;
  workingMemory?: UserReferenceSurface;
  sessionNotes?: UserReferenceSurface;
}

/** Lock-bound I/O seams for the dedicated user-reference operation. */
interface UserReferenceReconcileBaseContext {
  scratch?: ScratchReconcileInput;
  transitions: readonly ReachableReferenceTransition[];
  apply: boolean;
  readSurfaces: () => Promise<Omit<PlanUserReferenceReconcileInput, "transitions">>;
  acquireLock: () => Promise<unknown>;
  releaseLock: (handle: unknown) => Promise<void>;
}
/** Actual record snapshots behind a prepared personal repair and its supporting authority. */
export interface UserReferenceStoreBasis {
  store: Store;
  records: readonly StoreRecord[];
  byPath: ReadonlyMap<string, StoreRecord>;
}
/** Store preparation keeps snapshots fixed; legacy writes keep their under-lock re-plan. */
export type UserReferenceReconcileContext = UserReferenceReconcileBaseContext & (
  | { preparedStore: UserReferenceStoreBasis; atomicWrite?: (path: string, content: string) => Promise<void> }
  | { preparedStore?: undefined; atomicWrite: (path: string, content: string) => Promise<void> }
);

/** Closed dedicated operation result. */
export type UserReferenceReconcileResult =
  | { status: "clean" | "pending" | "advisory"; plan: UserReferenceReconcilePlan }
  | { status: "applied"; plan: UserReferenceReconcilePlan; writtenPaths: readonly string[] }
  | { status: "refused"; plan: UserReferenceReconcilePlan; refusal: StoreRefusal };

/** Authority adapters for protection-aware base discovery. */
export interface UserReferenceAuthorityContext {
  protection: "full" | "partial";
  baseBranch: string;
  refreshRemoteBase: () => Promise<boolean>;
  enumerateAt: (ref: string) => Promise<TransitionRecordEnumerationResult>;
}

/** Supplied base evidence for protection-aware user-reference authority analysis. */
export interface AnalyzeUserReferenceAuthorityOptions {
  store?: Store;
  protection: "full" | "partial";
  baseBranch: string;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  enumerateAt: (ref: string) => Promise<TransitionRecordEnumerationResult>;
}

/** Explicit acquisition inputs for user-reference authority. */
export interface MaterializeUserReferenceAuthorityOptions {
  store?: Store;
  exec: GitExec;
  protection: "full" | "partial";
  baseBranch: string;
  fetchTimeoutMs?: number;
  enumerateAt: (ref: string) => Promise<TransitionRecordEnumerationResult>;
}

/** User-reference authority qualified by the evidence that established it. */
export type UserReferenceEvidenceAuthorityResult =
  | { status: "unavailable"; ref: string; reason: "state-unavailable"; condition: string; remedy: Remedy; remoteEvidence: "not-applicable" }
  | {
      status: "ready";
      ref: string;
      transitions: readonly ReachableReferenceTransition[];
      remoteEvidence: "exact" | "not-applicable";
    }
  | {
      status: "pending";
      ref: string;
      reason: "base-object-pending-fetch";
      remoteEvidence: "pending-fetch";
    }
  | {
      status: "unavailable";
      ref: string;
      reason: "remote-base-absent";
      remoteEvidence: "exact";
    }
  | {
      /**
       * No remote evidence was required. Remote sync is off or no remote is configured,
       * which is a deliberate configuration rather than a failed read — so this arm
       * carries `not-applicable` instead of fabricating an `unreachable` reading, and
       * the projection offers no reconnect remedy for it.
       */
      status: "unavailable";
      ref: string;
      reason: "remote-not-required";
      remoteEvidence: "not-applicable";
    }
  | {
      status: "unavailable";
      ref: string;
      remoteEvidence: "unreachable";
      failureReason: RemoteFailureReason;
    }
  | {
      status: "conflict";
      ref: string;
      reason: "ambiguous-history" | "namespace-corrupt";
      remoteEvidence: "exact" | "not-applicable";
    };

/** Protection-aware transition authority result. */
export type UserReferenceAuthorityResult =
  | { status: "ready"; ref: string; transitions: readonly ReachableReferenceTransition[] }
  | { status: "unavailable"; ref: string }
  | { status: "conflict"; ref: string; reason: "ambiguous-history" | "namespace-corrupt" };

/** Read-only session projection with CLI-owned dispatch. */
export interface UserReferenceReconcileSessionResult extends z.infer<typeof UserReferenceReconcileSessionResultSchema> {
  readonly authority: z.infer<typeof UserReferenceReconcileSessionResultSchema>["authority"];
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
    const subject = input.stateOffBranch === true ? targetNamedByLine(line) : match?.[1];
    if (subject === undefined) return line;
    const resolution = resolveReferenceTransition(input.transitions, subject);
    if (resolution.kind === "rename") {
      replacements.push({ subject, targetSlug: resolution.targetSlug });
      const hint = input.stateOffBranch === true ? /\s+\((?:planned|provisional)\)$/u.exec(readEntryField(line, "WU_Target") ?? "")?.[0] ?? "" : match?.[2] ?? "";
      return `- _WU_Target:_ \`${resolution.targetSlug}${hint}\``;
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
    status: edits.length > 0 || (input.scratch?.moves.length ?? 0) > 0 ? "pending"
      : advisories.length > 0 || (input.scratch?.advisories.length ?? 0) > 0 ? "advisory" : "clean",
    ...(input.scratch === undefined ? {} : { scratch: input.scratch }),
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
  if (ctx.preparedStore !== undefined) return runPreparedUserReferenceReconcile(ctx, ctx.preparedStore);
  const readPlan = () => readUserReferencePlan(ctx);
  const inspected = await readPlan();
  if (!ctx.apply || !hasUserReferenceRepairs(inspected)) return { status: inspected.status, plan: inspected };

  const handle = await ctx.acquireLock();
  try {
    const current = await readPlan();
    if (!hasUserReferenceRepairs(current)) return { status: current.status, plan: current };
    for (const edit of current.edits) await ctx.atomicWrite(edit.path, edit.content);
    const scratch = ctx.scratch === undefined ? undefined : await applyScratchReconcile(ctx.scratch);
    return {
      status: "applied",
      plan: current,
      writtenPaths: [...current.edits.map(({ path }) => path), ...(scratch?.moves.map(move => move.to) ?? [])],
    };
  } finally {
    await ctx.releaseLock(handle);
  }
}

/**
 * Resolve user-reference authority from supplied advertised-base evidence.
 *
 * @param options - Protection mode, supplied base evidence, and retirement-record reader.
 * @returns Exact, pending, unavailable, or conflicting authority without acquiring remote state.
 */
export async function analyzeUserReferenceAuthority(
  options: AnalyzeUserReferenceAuthorityOptions,
): Promise<UserReferenceEvidenceAuthorityResult> {
  if (options.store?.capabilities.stateOffBranch) return readStoreReferenceAuthority(options.store);
  if (options.protection === "partial") {
    const ref = options.baseBranch;
    const projected = enumerateTransitionReferenceTransitions(await options.enumerateAt(ref));
    return projected.status === "valid"
      ? { status: "ready", ref, transitions: projected.transitions, remoteEvidence: "not-applicable" }
      : { status: "conflict", ref, reason: projected.reason, remoteEvidence: "not-applicable" };
  }
  if (options.snapshot.kind === "unreachable") {
    return {
      status: "unavailable",
      ref: `origin/${options.baseBranch}`,
      remoteEvidence: "unreachable",
      failureReason: options.snapshot.failureReason,
    };
  }
  const baseOid = options.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) {
    return {
      status: "unavailable",
      ref: `origin/${options.baseBranch}`,
      reason: "remote-base-absent",
      remoteEvidence: "exact",
    };
  }
  if (options.objectAvailability.kind !== "complete") {
    throw new Error("The advertised base commit is unavailable locally.");
  }
  const baseCommitIsLocal = options.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) {
    return {
      status: "pending",
      ref: baseOid,
      reason: "base-object-pending-fetch",
      remoteEvidence: "pending-fetch",
    };
  }
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  const projected = enumerateTransitionReferenceTransitions(await options.enumerateAt(baseOid));
  return projected.status === "valid"
    ? { status: "ready", ref: baseOid, transitions: projected.transitions, remoteEvidence: "exact" }
    : { status: "conflict", ref: baseOid, reason: projected.reason, remoteEvidence: "exact" };
}

/**
 * Materialize full-protection base evidence before invoking the pure authority analyzer.
 *
 * @param _options - Protection mode, Git boundary, timeout, and retirement-record reader.
 * @returns Exact authority or a typed visible acquisition failure.
 */
export async function materializeUserReferenceAuthority(
  options: MaterializeUserReferenceAuthorityOptions,
): Promise<UserReferenceEvidenceAuthorityResult> {
  if (options.store?.capabilities.stateOffBranch) return readStoreReferenceAuthority(options.store);
  if (options.protection === "partial") {
    return analyzeUserReferenceAuthority({
      protection: "partial",
      baseBranch: options.baseBranch,
      snapshot: { kind: "unreachable", failureReason: "error" },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      enumerateAt: options.enumerateAt,
    });
  }
  const sourceRef = `refs/heads/${options.baseBranch}`;
  if (options.baseBranch === "" || options.baseBranch.startsWith("-") || sourceRef.includes(":")) {
    throw new Error("Unsafe base ref.");
  }
  await options.exec("git", ["check-ref-format", sourceRef]);
  const fetch = await boundedGitInvocation(
    options.exec,
    ["fetch", "origin", `+${sourceRef}:refs/remotes/origin/${options.baseBranch}`],
    options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
  );
  if (fetch.outcome !== "ok") {
    if (isGitProcessError(fetch.error) && fetch.error.expectedOutcome === "absent-remote-ref") {
      return {
        status: "unavailable",
        ref: `origin/${options.baseBranch}`,
        reason: "remote-base-absent",
        remoteEvidence: "exact",
      };
    }
    return {
      status: "unavailable",
      ref: `origin/${options.baseBranch}`,
      remoteEvidence: "unreachable",
      failureReason: fetch.outcome === "timeout"
        ? "timeout"
        : classifyRemoteFailure(fetch.error),
    };
  }
  let baseOid: string;
  try {
    baseOid = (await options.exec(
      "git",
      ["rev-parse", "--verify", `refs/remotes/origin/${options.baseBranch}^{commit}`],
    )).stdout.trim();
    if (!isGitObjectId(baseOid)) throw new Error("Invalid materialized base OID.");
  } catch (error) {
    return {
      status: "unavailable",
      ref: `origin/${options.baseBranch}`,
      remoteEvidence: "unreachable",
      failureReason: classifyRemoteFailure(error),
    };
  }
  return analyzeUserReferenceAuthority({
    protection: "full",
    baseBranch: options.baseBranch,
    snapshot: { kind: "available", scope: "exact", tips: { [options.baseBranch]: baseOid } },
    objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
    enumerateAt: options.enumerateAt,
  });
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
  let enumeration: TransitionRecordEnumerationResult;
  try {
    enumeration = await ctx.enumerateAt(ref);
  } catch {
    return { status: "unavailable", ref };
  }
  const projected = enumerateTransitionReferenceTransitions(enumeration);
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
  authority: UserReferenceEvidenceAuthorityResult,
  surfaces: Omit<PlanUserReferenceReconcileInput, "transitions">,
): UserReferenceReconcileSessionResult {
  const inspect = {
    text: "arc user reconcile-references --json", argv: ["arc", "user", "reconcile-references", "--json"],
  };
  // No remote evidence was required, so there is nothing to reconcile and nothing to
  // report. Surfacing here would ask the operator to fix a configuration they chose.
  if (authority.status === "unavailable" && authority.remoteEvidence === "not-applicable" && authority.reason === "remote-not-required") {
    return {
      status: authority.status,
      authority,
      plan: null,
      recommendedAction: "skip",
      recommendedCommand: null,
      recommendedPromptText: "",
    };
  }
  if (authority.status !== "ready") {
    const failure = authority.status === "unavailable" && authority.remoteEvidence === "not-applicable"
      ? `${authority.condition} ${authority.remedy.text}` : `User-reference reconcile cannot establish ${authority.ref} authority (${authority.status}).`;
    return {
      status: authority.status,
      actions: [{ text: failure }],
      authority,
      plan: null,
      recommendedAction: "surface",
      recommendedCommand: null,
      recommendedPromptText: failure,
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
  if (hasUserReferenceRepairs(plan)) {
    return {
      status: "pending",
      actions: [inspect, { text: "arc user reconcile-references --apply --json",
        argv: ["arc", "user", "reconcile-references", "--apply", "--json"] },
        ...(plan.scratch?.advisories.map(advisory => ({ text: advisory.text })) ?? [])],
      authority,
      plan,
      recommendedAction: "apply",
      recommendedCommand: ["arc", "user", "reconcile-references", "--apply", "--json"],
      recommendedPromptText: surfaces.stateOffBranch === true
        ? "User references and personal scratch folders can be reconciled from authoritative work-unit evidence."
        : `Managed ${basename(surfaces.userInbox.path, ".md")} references can be reconciled from authoritative rename evidence.`,
    };
  }
  return {
    status: "advisory",
    actions: [inspect, ...(plan.scratch?.advisories.map(advisory => ({ text: advisory.text })) ?? [])],
    authority,
    plan,
    recommendedAction: "surface",
    recommendedCommand: ["arc", "user", "reconcile-references", "--json"],
    recommendedPromptText: surfaces.stateOffBranch === true
      ? `User-reference reconcile found ${plan.advisories.length + (plan.scratch?.advisories.length ?? 0)} advisory finding(s).`
      : `User-reference reconcile found ${plan.advisories.length} advisory reference(s).`,
  };
}

async function readStoreReferenceAuthority(store: Store): Promise<UserReferenceEvidenceAuthorityResult> {
  const read = await readStoreUserReferenceTransitions(store);
  return read.status === "ok" ? { status: "ready", ref: "store", transitions: read.result, remoteEvidence: "not-applicable" }
    : { status: "unavailable", ref: "store", reason: "state-unavailable", condition: read.refusal.condition, remedy: read.refusal.remedy, remoteEvidence: "not-applicable" };
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
    ...(resolution.kind === "decompose" && resolution.successors !== undefined ? { successors: resolution.successors } : {}),
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
        ...(resolution.kind === "decompose" && resolution.successors !== undefined ? { successors: resolution.successors } : {}),
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

/** Whether a plan contains lock-bound mechanical repairs. */
export function hasUserReferenceRepairs(plan: UserReferenceReconcilePlan): boolean {
  return plan.edits.length > 0 || (plan.scratch?.moves.length ?? 0) > 0;
}

async function readUserReferencePlan(ctx: UserReferenceReconcileBaseContext): Promise<UserReferenceReconcilePlan> {
  return planUserReferenceReconcile({ transitions: ctx.transitions, ...await ctx.readSurfaces(),
    ...(ctx.scratch === undefined ? {} : { scratch: await planScratchReconcile(ctx.scratch) }) });
}
async function runPreparedUserReferenceReconcile(ctx: UserReferenceReconcileBaseContext,
  basis: UserReferenceStoreBasis): Promise<UserReferenceReconcileResult> {
  const plan = await readUserReferencePlan(ctx);
  if (!ctx.apply) return { status: plan.status, plan };
  const writes = plan.edits.map(edit => {
    const record = basis.byPath.get(edit.path);
    if (record?.reference.kind !== "personal/inbox") throw new Error(`Prepared user-reference edit lacks an acquired personal inbox: ${edit.path}`);
    return recordPut(record, { content: edit.content });
  });
  const handle = await ctx.acquireLock();
  try {
    const valid = await revalidateLifecycleRecords(basis.store, basis.records);
    if (valid.status === "refused") return { status: "refused", plan, refusal: valid.refusal };
    if (writes.length > 0) {
      const records = basis.records.filter(record => writes.some(write => sameReference(write.reference, record.reference)));
      const applied = await applyPreparedLifecycleWrite(basis.store, { records, writes }, { verb: "user-reconcile-references", lifecycleAction: "reconcile" });
      if (applied.status === "refused") return { status: "refused", plan, refusal: applied.refusal };
    }
    const scratch = ctx.scratch === undefined ? undefined : await applyScratchReconcile(ctx.scratch);
    const current: UserReferenceReconcilePlan = scratch === undefined ? plan : { ...plan, scratch,
      status: plan.edits.length > 0 || scratch.moves.length > 0 ? "pending"
        : plan.advisories.length > 0 || scratch.advisories.length > 0 ? "advisory" : "clean" };
    const writtenPaths = [...plan.edits.map(edit => edit.path), ...(scratch?.moves.map(move => move.to) ?? [])];
    return writtenPaths.length === 0 ? { status: current.status, plan: current } : { status: "applied", plan: current, writtenPaths };
  } finally { await ctx.releaseLock(handle); }
}
