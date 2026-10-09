/** Resolve checked trees and base coordinates before executing repository checks. */
import type { GitExec } from "../git/exec.js";
import { resolveSoleMergeBase } from "../git/base-overlap.js";
import { requestScope, type CheckRequest, type CheckScope } from "./request.js";
import { readCheckMergedParents } from "./merged.js";
import { createWorktreeSnapshot, stagedWorktreeTree, type WorktreeSnapshot } from "./tree.js";

/** Coordinates retained by a resolved request. An unavailable automatic base is deliberately absent. */
export interface ResolvedCheckRequest {
  scope: CheckScope;
  tree: string;
  base?: string;
  merged?: string[];
  snapshot?: WorktreeSnapshot;
  worktreeTree?: string;
}
export type CheckRequestResolution = { status: "resolved"; request: ResolvedCheckRequest }
  | { status: "refused"; message: string };

async function revision(git: GitExec, root: string, ref: string): Promise<string | undefined> {
  try {
    return (await git("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], { cwd: root })).stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Resolve the configured base using its own upstream or a pushed remote before local fallback.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param branch - Configured local base branch
 * @param remote - Optional remote receiving a push
 * @returns The resolved base commit or an unavailable coordinate
 */
export async function resolveCheckBaseBranch(git: GitExec, root: string, branch: string, remote?: string): Promise<string | undefined> {
  const preferred = remote === undefined ? `${branch}@{upstream}` : `refs/remotes/${remote}/${branch}`;
  return await revision(git, root, preferred) ?? await revision(git, root, `refs/heads/${branch}`);
}

async function automaticBase(git: GitExec, root: string, request: CheckRequest, head: string | undefined): Promise<string | undefined> {
  if (head === undefined) return undefined;
  if (request.form.kind === "segment") {
    const upstream = await revision(git, root, "@{upstream}");
    if (upstream !== undefined) return upstream;
  }
  const base = await resolveCheckBaseBranch(git, root, request.baseBranch ?? "main");
  if (base === undefined) return undefined;
  const resolved = await resolveSoleMergeBase({
    exec: (command, args, options) => git(command, args, { ...options, cwd: root }),
    leftRevision: head, rightRevision: base,
  });
  return resolved.status === "resolved" ? resolved.mergeBase : undefined;
}

/**
 * Resolve a validated form into one checked tree and base, or refuse an explicitly unresolved ref.
 * @param git - Git process boundary
 * @param root - Repository root
 * @param request - Typed request and configured base branch
 * @param snapshotDirectory - Retain a worktree snapshot in this directory when supplied
 * @returns Coordinates or a refusal naming the explicit input and safe retry
 */
export async function resolveCheckRequest(git: GitExec, root: string, request: CheckRequest, snapshotDirectory?: string): Promise<CheckRequestResolution> {
  const scope = requestScope(request);
  const head = await revision(git, root, "HEAD");
  let base: string | undefined;
  if (scope.kind === "range" && scope.base !== undefined) {
    base = await revision(git, root, scope.base);
    if (base === undefined) return { status: "refused", message: `Could not resolve ref ${scope.base}; provide a resolvable commit ref and retry.` };
  } else if (scope.kind === "range" || scope.kind === "all") {
    base = await automaticBase(git, root, request, head);
  } else {
    base = head;
  }
  const merged = base !== undefined && head !== undefined && scope.kind !== "all" ? await readCheckMergedParents(git, root, base, head) : [];
  const { tree, snapshot } = await checkedContent(git, root, request, scope, snapshotDirectory);
  return { status: "resolved", request: { scope, tree, ...(snapshot ? { snapshot } : {}), ...(base === undefined ? {} : { base }), ...(merged.length ? { merged } : {}) } };
}

async function checkedContent(git: GitExec, root: string, request: CheckRequest, scope: CheckScope, snapshotDirectory?: string) {
  const snapshot = scope.kind !== "staged" && snapshotDirectory !== undefined
    ? await createWorktreeSnapshot(git, root, snapshotDirectory) : undefined;
  const tree = scope.kind === "staged"
    ? (await git("git", ["write-tree"], { cwd: root, indexFile: request.indexFile })).stdout
    : snapshot?.tree ?? await stagedWorktreeTree(git, root);
  return { tree, snapshot };
}
