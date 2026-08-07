/** Production local-frame transaction for ordinary Errand promotion. */

import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseMetaRecord, renderMetaFile, type MetaRenderOverrides } from "../active/meta-reader.js";
import {
  MetaPrioritySchema,
  MetaPromotionReceiptSchema,
  MetaWorkClassSchema,
} from "../active/meta-schema.js";
import { atomicCreateFile } from "../fs.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import {
  decodeWorktreeMarkerOwnership,
  readWorktreeMarkerGeneration,
  removePrimaryTransientOccupancy,
  replaceWorktreeMarkerGeneration,
  type WorktreeMarker,
} from "../git/worktree-marker.js";
import { resolveArcPath } from "../layout/index.js";
import { SlugSchema, type CanonicalDigest } from "../kernel/index.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord } from "./identity-transitions.js";
import { transactTransientIdentities } from "./identity-transaction.js";
import type { ErrandPromotionResult } from "./promotion-result.js";
import { authorizeErrandTerminal, type ErrandTerminalAuthority } from "./terminal-authority.js";
import {
  promoteOrdinaryErrand,
  type PromoteFloor,
  type PromotionFrameReceipt,
  type PromotionFrameResult,
  type PromotionRefusalReason,
} from "./promote.js";

export interface PromoteOrdinaryErrandRuntimeOptions {
  readonly slug: string;
  readonly name: string;
  readonly type: string;
  readonly floor: PromoteFloor;
  readonly owner: string;
  readonly priority?: string;
  readonly class?: string;
  readonly protection: "full" | "partial";
  readonly base: string;
  readonly identity: string;
  readonly exec: GitExec;
  readonly execInput: GitExecInput;
  readonly readFrame: () => Promise<DerivedLocusFrame>;
  readonly confirmForeignGeneration?: string;
  readonly settleInbox: (binding: {
    readonly originEntry: string;
    readonly originEntrySourceDigest: CanonicalDigest;
  }) => Promise<PromotionInboxSettlementResult>;
}

export type PromotionInboxSettlementResult =
  | { readonly kind: "applied" | "idempotent" }
  | { readonly kind: "refused"; readonly message: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * Promote an exact ordinary-v3 checkout from derived subject authority.
 *
 * @param options - Exact identity, work-unit target, derived-frame reader, and mutation boundaries
 * @returns The producer-validated promotion result
 */
export async function promoteOrdinaryErrandAtRuntime(
  options: PromoteOrdinaryErrandRuntimeOptions,
): Promise<ErrandPromotionResult> {
  const io = { exec: options.exec, execInput: options.execInput, identity: options.identity };
  const remote = await configuredIdentityRemote(options.exec);
  return promoteOrdinaryErrand({
    ...options,
    dependencies: {
      readIdentity: async () => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: reconcile errand identity ${options.slug}`,
          transform: (records) => ({ kind: "idempotent", value: records.get(options.slug) ?? null }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: "ready", record: result.value };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
      recoverPromoted: async () => recoverPromotedFrame(options, await options.readFrame()),
      replaceFrame: async (record) => replaceLocalFrame(options, record, await options.readFrame()),
      retire: async (record) => {
        const result = await transactTransientIdentities(io, {
          remote,
          message: `arc: promote errand ${options.slug}`,
          transform: ordinaryErrandTransform({
            kind: "retire", previous: record, reason: "promotion", authorization: "local",
          }),
        });
        if (result.kind === "applied" || result.kind === "idempotent") return { kind: result.kind };
        return result.kind === "refused"
          ? { kind: "refused", reason: result.reason }
          : { kind: "error", message: result.message };
      },
      settleInbox: async (frame) => settlePromotedInbox(options, frame),
      settleOccupancy: async (frame) => settlePromotedOccupancy(options, frame),
    },
  });
}

async function replaceLocalFrame(
  options: PromoteOrdinaryErrandRuntimeOptions,
  record: OrdinaryErrandRecord,
  frame: DerivedLocusFrame,
): Promise<PromotionFrameResult> {
  const branch = promotionBranch(options);
  const metaPath = promotionMetaPath(options.name);
  const expectedMeta = renderMetaFile(options.name, metaOverrides(options, branch, record));
  try {
    await options.exec("git", ["check-ref-format", "--branch", branch]);
  } catch {
    return refused("promotion-source-invalid", `Promotion branch '${branch}' is invalid.`);
  }
  const normalized = await normalizePromotionWindow(frame, record, branch, metaPath, expectedMeta);
  if (normalized.kind === "refused" || normalized.kind === "error") return normalized;
  const authority = authorizeErrandTerminal({
    frame: normalized.frame,
    operation: "promote",
    subject: { kind: "errand", slug: record.slug, claimId: record.claimId },
    confirmForeignGeneration: options.confirmForeignGeneration,
    retryArguments: promotionRetryArguments(options),
  });
  if (authority.kind === "confirmation-required") {
    if (authority.subject.kind !== "errand") {
      return refused("role-conflict", "Promotion authority selected an incompatible transient subject.");
    }
    return {
      kind: "confirmation-required",
      subject: authority.subject,
      checkoutPath: authority.checkoutPath,
      generation: authority.generation,
      destructiveEffect: authority.destructiveEffect,
      recommendedPromptText: authority.recommendedPromptText,
    };
  }
  if (authority.kind === "refused") return refused(authorityRefusalReason(authority), authority.message);
  const row = authority.row;
  if (row === null || authority.checkoutPath === null) {
    return refused("checkout-missing", "Promotion requires the exact Errand checkout.");
  }
  const checkoutPath = authority.checkoutPath;
  const source = await inspectCheckout(options.exec, checkoutPath, record.branch, branch, metaPath, expectedMeta);
  if (source.kind !== "ready") return source;
  if (source.branch !== row.checkout.branch || source.head !== row.checkout.head) {
    return refused("promotion-source-invalid", "Promotion checkout facts changed after authority derivation.");
  }
  if (source.branch === record.branch && source.metaPresent) {
    return refused("work-unit-name-taken", `Work-unit meta '${metaPath}' already exists.`);
  }
  if (source.branch === branch && !source.metaMatches) {
    return refused("promotion-source-invalid", "Promoted work-unit evidence does not match the exact Errand generation.");
  }
  let localKind: "applied" | "idempotent" = "idempotent";
  if (source.branch !== branch || !source.metaPresent) {
    const local = await applyLocalEvidence(options, checkoutPath, branch, metaPath, expectedMeta, source);
    if (local.kind === "refused" || local.kind === "error") return local;
    localKind = local.kind;
  }
  const rechecked = await inspectCheckout(
    options.exec, checkoutPath, record.branch, branch, metaPath, expectedMeta, source.head,
  );
  if (rechecked.kind !== "ready") return rechecked;
  return receiptFromAuthority(
    localKind,
    authority,
    row,
    branch,
    metaPath,
    record,
    rechecked.metaCommitted,
  );
}

async function normalizePromotionWindow(
  frame: DerivedLocusFrame,
  record: OrdinaryErrandRecord,
  targetBranch: string,
  metaPath: string,
  expectedMeta: string,
): Promise<
  | { kind: "ready"; frame: DerivedLocusFrame }
  | Extract<PromotionFrameResult, { kind: "refused" | "error" }>
> {
  const matches = frame.roster.filter((row) => row.subject?.kind === "errand"
    && row.subject.key === record.slug && row.subject.claimId === record.claimId);
  if (matches.length !== 1) return { kind: "ready", frame };
  const row = matches[0];
  if (row === undefined || row.subject === null
    || row.kind !== "unresolved-checkout" || row.checkout.branch !== targetBranch) {
    return { kind: "ready", frame };
  }
  if (row.diagnostics.length === 0 || row.diagnostics.some((diagnostic) => diagnostic.code !== "topology-mismatch")) {
    return { kind: "ready", frame };
  }
  try {
    const meta = await readOptionalFile(join(row.checkout.path, metaPath));
    if (meta !== null && meta !== expectedMeta) {
      return refused(
        "promotion-source-invalid",
        "Promoted work-unit evidence does not match the exact Errand generation.",
      );
    }
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
  const normalizedRow: DerivedCheckoutRow = { ...row, kind: "transient", subject: row.subject, diagnostics: [] };
  return {
    kind: "ready",
    frame: {
      ...frame,
      roster: frame.roster.map((candidate) => candidate.checkout.path === row.checkout.path ? normalizedRow : candidate),
      entering: frame.entering.kind === "selected" && frame.entering.row.checkout.path === row.checkout.path
        ? { kind: "selected", row: normalizedRow }
        : frame.entering,
    },
  };
}

async function applyLocalEvidence(
  options: PromoteOrdinaryErrandRuntimeOptions,
  checkoutPath: string,
  branch: string,
  metaPath: string,
  expectedMeta: string,
  source: Extract<Awaited<ReturnType<typeof inspectCheckout>>, { kind: "ready" }>,
): Promise<{ kind: "applied" | "idempotent" } | Extract<PromotionFrameResult, { kind: "refused" | "error" }>> {
  let changed = false;
  try {
    if (source.branch !== branch) {
      if (await localBranchExists(options.exec, branch)) {
        return refused("work-unit-name-taken", `Target branch '${branch}' already exists.`);
      }
      await options.exec("git", ["branch", "-m", source.branch, branch], { cwd: checkoutPath });
      changed = true;
    }
    const absoluteMeta = join(checkoutPath, metaPath);
    const existing = await readFile(absoluteMeta, "utf8").catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (existing === null) {
      await mkdir(join(checkoutPath, resolveArcPath({ kind: "placement-root", tier: "active" })), { recursive: true });
      try {
        await atomicCreateFile(absoluteMeta, expectedMeta);
        changed = true;
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const raced = await readFile(absoluteMeta, "utf8");
        if (raced !== expectedMeta) {
          return refused("work-unit-name-taken", `Work-unit meta '${metaPath}' already exists with different content.`);
        }
      }
    } else if (existing !== expectedMeta) {
      return refused("work-unit-name-taken", `Work-unit meta '${metaPath}' already exists with different content.`);
    }
    return { kind: changed ? "applied" : "idempotent" };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

async function convertSpawnedMarker(
  checkoutPath: string,
  record: { slug: string; claimId: string },
  name: string,
): Promise<{ kind: "applied" | "idempotent" } | Extract<PromotionFrameResult, { kind: "refused" | "error" }>> {
  const generation = await readWorktreeMarkerGeneration(checkoutPath);
  if (generation.kind !== "present") return refused("role-conflict", "Spawned promotion marker is missing or malformed.");
  const decoded = decodeWorktreeMarkerOwnership(generation.marker);
  if (decoded.kind === "current" && decoded.subject.kind === "work-unit" && decoded.subject.name === name) {
    return { kind: "idempotent" };
  }
  if (decoded.kind !== "current" || decoded.provisioning !== "ready"
    || decoded.subject.kind !== "errand" || decoded.subject.slug !== record.slug
    || !("claimId" in decoded.subject) || decoded.subject.claimId !== record.claimId) {
    return refused("role-conflict", "Spawned promotion marker does not match the exact Errand generation.");
  }
  const marker: WorktreeMarker = {
    spawnedByArc: generation.marker.spawnedByArc,
    wuName: name,
    createdFor: { kind: "work-unit", name },
    spawningIdentity: generation.marker.spawningIdentity,
    createdAt: generation.marker.createdAt,
  };
  const replaced = await replaceWorktreeMarkerGeneration(checkoutPath, generation.bytes, marker);
  return replaced.kind === "replaced"
    ? { kind: "applied" }
    : refused("role-conflict", "Spawned promotion marker changed.");
}

async function recoverPromotedFrame(
  options: PromoteOrdinaryErrandRuntimeOptions,
  frame: DerivedLocusFrame,
): Promise<PromotionFrameResult | null> {
  const branch = promotionBranch(options);
  const matches = frame.roster.filter((row) => row.checkout.branch === branch);
  if (matches.length === 0) return null;
  if (matches.length !== 1) return refused("duplicate-locus", "Promoted work-unit session locus is ambiguous.");
  const row = matches[0];
  if (row === undefined) return refused("checkout-missing", "Promoted work-unit checkout is unavailable.");
  const metaPath = promotionMetaPath(options.name);
  const meta = await readOptionalFile(join(row.checkout.path, metaPath));
  if (meta === null) return refused("promotion-source-invalid", "Promoted work-unit meta is missing.");
  const promotionReceipt = parseMetaRecord(meta).promotionReceipt;
  const parsedReceipt = MetaPromotionReceiptSchema.safeParse(promotionReceipt);
  if (!parsedReceipt.success) {
    return refused("promotion-source-invalid", "Promoted work-unit receipt is missing or malformed.");
  }
  const [, receiptSlug, claimId] = parsedReceipt.data.split("/");
  if (receiptSlug !== options.slug || claimId === undefined) {
    return refused(
      "promotion-source-invalid",
      "Promoted work-unit recovery does not match the originating Errand generation.",
    );
  }
  const promotionSource = { slug: receiptSlug, claimId };
  const expectedMeta = renderMetaFile(options.name, metaOverrides(options, branch, promotionSource));
  const inspected = await inspectCheckout(options.exec, row.checkout.path, branch, branch, metaPath, expectedMeta);
  if (inspected.kind !== "ready") return inspected;
  if (!carriesPromotedEvidence(inspected, branch) || !inspected.metaCommitted) {
    return refused("promotion-source-invalid", "Promoted work-unit evidence is incomplete.");
  }
  return {
    kind: "idempotent",
    subject: promotionSource,
    generation: parsedReceipt.data,
    branch,
    metaPath,
    checkoutPath: row.checkout.path,
    allocation: row.checkout.primary ? "primary" : "spawned",
    parentCheckoutPath: row.parentCheckoutPath,
    originEntry: null,
    originEntrySourceDigest: null,
    metaCommitted: true,
  };
}

async function settlePromotedInbox(
  options: PromoteOrdinaryErrandRuntimeOptions,
  frame: PromotionFrameReceipt,
): Promise<PromotionFrameResult> {
  if (frame.originEntry !== null && frame.originEntrySourceDigest === null) {
    return refused("record-malformed", "Promoted capture settlement is missing its source digest.");
  }

  let settlementKind: "applied" | "idempotent" = "idempotent";
  if (frame.originEntry !== null && frame.originEntrySourceDigest !== null) {
    let settled: PromotionInboxSettlementResult;
    try {
      settled = await options.settleInbox({
        originEntry: frame.originEntry,
        originEntrySourceDigest: frame.originEntrySourceDigest,
      });
    } catch (error) {
      return { kind: "error", message: error instanceof Error ? error.message : String(error) };
    }
    if (settled.kind === "refused") return refused("inbox-link-conflict", settled.message);
    if (settled.kind === "error") return { kind: "error", message: settled.message };
    settlementKind = settled.kind;
  }
  return {
    ...frame,
    kind: settlementKind,
    originEntry: null,
    originEntrySourceDigest: null,
  };
}

async function settlePromotedOccupancy(
  options: PromoteOrdinaryErrandRuntimeOptions,
  frame: PromotionFrameReceipt,
): Promise<PromotionFrameResult> {
  const marker = frame.allocation === "primary"
    ? await removePrimaryTransientOccupancy(frame.checkoutPath, {
        kind: "errand", slug: frame.subject.slug, claimId: frame.subject.claimId,
      })
    : await convertSpawnedMarker(frame.checkoutPath, frame.subject, options.name);
  if (marker.kind === "refused") return refused("role-conflict", "Promotion marker generation changed.");
  if (marker.kind === "error") return marker;
  const markerApplied = marker.kind === "applied" || marker.kind === "removed";
  return {
    ...frame,
    kind: frame.kind === "applied" || markerApplied ? "applied" : "idempotent",
    parentCheckoutPath: null,
  };
}

async function inspectCheckout(
  exec: GitExec,
  checkoutPath: string,
  sourceBranch: string,
  targetBranch: string,
  metaPath: string,
  expectedMeta: string,
  expectedHead?: string,
): Promise<
  | {
      kind: "ready";
      branch: string;
      head: string;
      metaPresent: boolean;
      metaMatches: boolean;
      metaCommitted: boolean;
    }
  | Extract<PromotionFrameResult, { kind: "refused" | "error" }>
> {
  try {
    const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: checkoutPath })).stdout.trim();
    if ((branch !== sourceBranch && branch !== targetBranch) || (expectedHead !== undefined && head !== expectedHead)) {
      return refused("promotion-source-invalid", "Promotion checkout branch or head changed.");
    }
    const absoluteMeta = join(checkoutPath, metaPath);
    const meta = await readOptionalFile(absoluteMeta);
    const status = (await exec("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: checkoutPath })).stdout;
    const entries = status.split(/\r?\n/u).filter(Boolean);
    // Only the promotion's own write is recoverable dirt, and it produces exactly one untracked
    // meta. Any other index or worktree state on that path is the user's, not the transaction's.
    const recoverable = branch === targetBranch && meta === expectedMeta;
    const allowedDirty = recoverable
      ? entries.every((entry) => entry === `?? ${metaPath}`)
      : entries.length === 0;
    if (!allowedDirty) {
      return refused("promotion-source-invalid", recoverable
        ? "Promotion checkout carries changes beyond its own untracked meta."
        : "Promotion checkout has uncommitted changes.");
    }
    return {
      kind: "ready",
      branch,
      head,
      metaPresent: meta !== null,
      metaMatches: meta === expectedMeta,
      metaCommitted: recoverable && entries.length === 0,
    };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Whether a checkout carries the evidence a completed promotion leaves behind.
 *
 * Persisted source provenance establishes identity; the renamed branch and exact meta additionally
 * prove that the checkout-local half of the promotion reached its intended frame.
 */
function carriesPromotedEvidence(
  inspected: { branch: string; metaMatches: boolean },
  promotedBranch: string,
): boolean {
  return inspected.branch === promotedBranch && inspected.metaMatches;
}

function receiptFromAuthority(
  kind: "applied" | "idempotent",
  authority: Extract<ErrandTerminalAuthority, { kind: "authorized" }>,
  row: DerivedCheckoutRow,
  branch: string,
  metaPath: string,
  record: OrdinaryErrandRecord,
  metaCommitted: boolean,
): PromotionFrameReceipt {
  return {
    kind,
    subject: { slug: record.slug, claimId: record.claimId },
    generation: authority.generation,
    branch,
    metaPath,
    checkoutPath: row.checkout.path,
    allocation: row.checkout.primary ? "primary" : "spawned",
    parentCheckoutPath: authority.parentCheckoutPath,
    originEntry: record.originEntry,
    originEntrySourceDigest: record.origin === "inbox"
      ? record.originEntrySourceDigest as CanonicalDigest
      : null,
    metaCommitted,
  };
}

function promotionRetryArguments(options: PromoteOrdinaryErrandRuntimeOptions): string[] {
  return [
    "--name", options.name,
    "--type", options.type,
    "--floor", options.floor,
    ...(options.priority === undefined ? [] : ["--priority", options.priority]),
    ...(options.class === undefined ? [] : ["--class", options.class]),
  ];
}

function authorityRefusalReason(
  authority: Extract<ErrandTerminalAuthority, { kind: "refused" }>,
): PromotionRefusalReason {
  if (authority.reason === "identity-conflict"
    || authority.reason === "authority-unresolved"
    || authority.reason === "generation-mismatch") return authority.reason;
  return "role-conflict";
}

function promotionBranch(options: Pick<PromoteOrdinaryErrandRuntimeOptions, "floor" | "name" | "type">): string {
  return options.floor === "derivation" ? `plan/${options.name}` : `${options.type}/${options.name}`;
}

function promotionMetaPath(name: string): string {
  return resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: SlugSchema.parse(name),
    artifact: "meta",
  });
}

function metaOverrides(
  options: Pick<PromoteOrdinaryErrandRuntimeOptions, "owner" | "priority" | "class" | "floor">,
  branch: string,
  promotionSource: { slug: string; claimId: string },
): MetaRenderOverrides {
  const overrides: MetaRenderOverrides = {
    owner: options.owner,
    branch,
    lastCompleted: "Errand promoted to work unit",
    promotionReceipt: `errand-v1/${promotionSource.slug}/${promotionSource.claimId}`,
  };
  if (options.priority !== undefined) overrides.priority = MetaPrioritySchema.parse(options.priority);
  if (options.class !== undefined) overrides.workClass = MetaWorkClassSchema.parse(options.class);
  if (options.floor === "derivation") {
    overrides.state = "Planning";
    overrides.currentWorkflow = "draft-design";
    overrides.nextAction = "Resolve the design before further implementation.";
  } else {
    overrides.state = "Active";
    overrides.nextAction = "Backfill a brief spec and task list, then continue implementation.";
  }
  return overrides;
}

async function localBranchExists(exec: GitExec, branch: string): Promise<boolean> {
  const args = ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`];
  try {
    await exec("git", args);
    return true;
  } catch (error) {
    if (normalizeGitRejection(error, { command: "git", args }).exitCode === 1) return false;
    throw error;
  }
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

async function configuredIdentityRemote(exec: GitExec): Promise<"origin" | null> {
  try {
    return (await exec("git", ["remote", "get-url", "origin"])).stdout.trim() === "" ? null : "origin";
  } catch {
    return null;
  }
}

function refused(
  reason: Extract<PromotionFrameResult, { kind: "refused" }> ["reason"],
  message: string,
): Extract<PromotionFrameResult, { kind: "refused" }> {
  return { kind: "refused", reason, message };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}
