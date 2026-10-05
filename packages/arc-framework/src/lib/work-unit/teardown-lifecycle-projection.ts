/** Distinguish live lifecycle projections from the exact source of an authorized shipped husk. */
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseMetaRecord } from "../active/meta-reader.js";
import { decodeWorktreeHuskStamp, readWorktreeMarker, type WorktreeHuskStamp } from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { localPathsEqual } from "../local-path-identity.js";
import { validateManagedPath } from "../kernel/canonical/managed-path.js";
import { branchToWorkUnitSlug } from "./completed-index.js";
import { buildLifecycleIndex, type LifecycleIndexEntry } from "./lifecycle-index.js";
import { isSelfTeardown } from "./mutators/reconcile-work-unit-worktree.js";
import { gitTransitionExpectedLifecycle, type TeardownAuthorizationDecision } from "./retirement-authority.js";
import type { TeardownContext } from "./verbs/teardown.js";

type AuthorizedRetirement = Extract<TeardownAuthorizationDecision, { status: "authorized" }>;
type ProjectionContext = Pick<TeardownContext, "cwd" | "exec" | "indexFs" | "readBlob" | "readMarker" | "scanWorktrees">;

function stampMatchesRetirement(stamp: WorktreeHuskStamp, proof: AuthorizedRetirement, branch: string): boolean {
  const decoded = decodeWorktreeHuskStamp(stamp);
  return decoded.kind === "current"
    && stamp.branch === branch
    && stamp.sha === proof.refs.localOid
    && decoded.authorization === proof.authorization
    && isDeepStrictEqual(decoded.evidence, proof.evidence)
    && isDeepStrictEqual(decoded.remoteRef, proof.refs.remote);
}

async function isStampedSourceProjection(
  ctx: ProjectionContext,
  entry: LifecycleIndexEntry,
  content: string,
  branch: string,
  proof: AuthorizedRetirement,
  retiringPath: string,
): Promise<boolean> {
  if (proof.evidence.kind !== "shipped" || proof.authorization !== "merged-preserved") return false;
  if (entry.location !== "active" || !(await localPathsEqual(retiringPath, ctx.cwd))) return false;
  const state = parseMetaRecord(content).state;
  if (state !== "Active" && state !== "Integrating") return false;
  const marker = await (ctx.readMarker ?? readWorktreeMarker)(retiringPath);
  if (marker.kind !== "present" || marker.marker.husk === undefined) return false;
  const stamp = marker.marker.husk;
  if (stamp.subject.kind !== "work-unit" || stamp.subject.name !== entry.slug) return false;
  if (!stampMatchesRetirement(stamp, proof, branch)) return false;
  return await matchesDetachedSource(ctx, retiringPath, stamp.sha, entry.path, content);
}

async function matchesDetachedSource(
  ctx: ProjectionContext,
  retiringPath: string,
  sha: string,
  metaPath: string,
  content: string,
): Promise<boolean> {
  const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
  if (!scan.ok) return false;
  for (const worktree of scan.worktrees) {
    if (!(await localPathsEqual(worktree.path, retiringPath))) continue;
    if (!worktree.detached || worktree.head !== sha) return false;
    // Match the preserved source text while allowing Git's checkout line-ending conversion.
    const blob = await ctx.readBlob(sha, validateManagedPath(metaPath));
    return blob !== null
      && Buffer.from(blob).toString("utf8").replace(/\r\n/gu, "\n") === content.replace(/\r\n/gu, "\n");
  }
  return false;
}

/**
 * Check for lifecycle ownership that conflicts with a validated directional retirement.
 *
 * @param ctx - Checkout-bound lifecycle, topology, marker, and committed-blob readers.
 * @param branch - Exact branch being retired.
 * @param proof - Retirement authority already validated by the teardown driver.
 * @param retiringPath - Exact registered checkout selected for retirement.
 * @returns Whether lifecycle ownership vetoes ref cleanup; unreadable evidence vetoes cleanup.
 */
export async function hasCompetingLifecycleProjection(
  ctx: ProjectionContext,
  branch: string,
  proof: AuthorizedRetirement,
  retiringPath: string,
): Promise<boolean> {
  const index = await buildLifecycleIndex({ cwd: ctx.cwd, fs: ctx.indexFs });
  const slug = branchToWorkUnitSlug(branch);
  if (slug === null) return false;
  const entry = index.get(slug);
  if (entry === undefined) return false;
  try {
    const content = await ctx.indexFs.readFile(join(ctx.cwd, entry.path));
    const declaredBranch = parseMetaRecord(content).branch;
    if (declaredBranch !== branch) return false;
    const expectedLifecycle = proof.evidence.kind === "shipped"
      ? "completed"
      : gitTransitionExpectedLifecycle(proof.evidence.transition);
    if (
      (expectedLifecycle === "completed" && entry.location === "completed")
      || (expectedLifecycle === "planned" && entry.location === "planned")
    ) {
      return !(await isSelfTeardown(retiringPath, ctx.cwd));
    }
    return !(await isStampedSourceProjection(ctx, entry, content, branch, proof, retiringPath));
  } catch {
    return true;
  }
}
