/**
 * `openErrand` — the composed core of `arc errand open`.
 *
 * Opens a full-protection errand by composing the already-shipped creation-only
 * branch cut, the record mint, the record push, and the occupy step, honoring
 * the cut→occupy contract in code: cut creates the branch, then the session
 * occupies it so it never lingers on the launch branch. The record is the
 * errand's logical identity; the branch is its projection.
 *
 * Occupy is an in-place `git switch` — the worktree-spawn variant is deferred
 * until parallel code work units are viable. The git seams and identity are
 * injected (three-layer architecture).
 *
 * @module
 */

import { cutErrandBranch } from "../session-init/errand-branch-cut.js";
import { DEFAULT_ERRAND_BRANCH_TYPE, type ErrandBranchType } from "./branch-type.js";
import { reconcileErrandPush, type ErrandPushOutcome } from "./merge.js";
import { readErrandRecord, writeErrandRecord, type ErrandRecord } from "./record.js";
import type { ErrandRecordIO } from "./ref-tree.js";
import type { GitExec } from "../git/exec.js";

/** Operands for {@link openErrand}. */
export interface OpenErrandParams {
  /** The errand slug — its logical identity and the record's tree key. */
  slug: string;
  /** The base branch the errand forks from (a resolved `branch.base`). */
  base: string;
  /** Branch nature-type prefixing the slug; defaults to `chore`. */
  type?: ErrandBranchType;
  /** Free-text concern; defaults to the slug when omitted or blank. */
  intent?: string;
  /**
   * Originating `USER-INBOX` capture slug, when the errand is adopted from a
   * drained capture. Its presence makes the record `inbox`-origin and is the
   * back-pointer `arc errand close` drops; absent for a free-description launch.
   */
  originEntry?: string;
  /** ISO-8601 launch timestamp — injected so the core stays deterministic. */
  createdAt: string;
}

/** Outcome of {@link openErrand}. */
export interface OpenErrandResult {
  /** The minted (and locally-written) record. */
  record: ErrandRecord;
  /** True when this call created the branch; false when it already existed. */
  branchCreated: boolean;
  /** The record-push outcome (non-fatal; a failure rides `arc sync` later). */
  push: ErrandPushOutcome;
}

/**
 * Open an errand: cut a nature-typed branch off the base (no-clobber), mint the
 * identity record and push it, then occupy the branch in place.
 *
 * The push is non-fatal — its outcome is returned for the caller to surface and
 * (on failure) flag for later sync recovery; the record is already written
 * locally and rides `arc sync` regardless. Occupy runs last so a successful
 * open always lands the session on the errand branch.
 *
 * @param io - Injected git seams and identity.
 * @param params - The errand slug, base, nature-type, intent, originating capture, and launch time.
 * @returns The minted record, whether the branch was created, and the push outcome.
 */
export async function openErrand(
  io: ErrandRecordIO,
  params: OpenErrandParams,
): Promise<OpenErrandResult> {
  const slug = params.slug.trim();
  if (slug === "") throw new Error("openErrand: slug must be non-empty");

  const previous = await readErrandRecord(io, slug);
  const launchBranch = await symbolicBranch(io.exec);

  const cut = await cutErrandBranch(
    { exec: io.exec },
    { slug, base: params.base, type: params.type ?? DEFAULT_ERRAND_BRANCH_TYPE },
  );

  const intent = params.intent?.trim();
  const originEntry = params.originEntry?.trim();
  const adopted = originEntry !== undefined && originEntry !== "";
  const returnBranch = previous?.version === 2 && previous.returnBranch !== undefined
    ? previous.returnBranch
    : launchBranch !== cut.branch ? launchBranch : null;
  const record: ErrandRecord = {
    version: 2,
    slug,
    origin: adopted ? "inbox" : "description",
    intent: intent !== undefined && intent !== "" ? intent : slug,
    branch: cut.branch,
    createdAt: params.createdAt,
    ...(adopted ? { originEntry } : {}),
    ...(returnBranch !== null ? { returnBranch } : {}),
  };
  await writeErrandRecord(io, record);
  const push = await reconcileErrandPush(io);

  // Occupy in place — the cut→occupy contract's caller side. The worktree-spawn
  // variant is deferred until parallel code work units are viable.
  await io.exec("git", ["switch", cut.branch]);

  return { record, branchCreated: cut.created, push };
}

/** The current symbolic branch, or `null` when HEAD is detached. */
async function symbolicBranch(exec: GitExec): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
