/** Shared branch commit inventory for task capture and activation exclusions. @module */

import { boundedGitInvocation, type GitExec, type RawGitExec } from "./exec.js";
import { DEFAULT_NETWORK_TIMEOUT_MS } from "./remote-ref-reader.js";
import { computeCopyKeys } from "./copy-key.js";
import type { BranchLink, CommitCapture } from "../store/links.js";

/** Facts retained for one uncaptured commit. */
export interface DefaultCaptureCommit {
  sha: string;
  copyKey?: string;
  authorTime: number | null;
  committerTime: number | null;
}

/** Inputs from the caller's branch links and current checkout. */
export interface DefaultCaptureSetInput {
  exec: GitExec;
  execRaw?: RawGitExec;
  cwd: string;
  baseBranch: string;
  repository: string;
  tips?: string[];
  captures?: CommitCapture[];
  exclusions?: CommitCapture[];
  refresh?: boolean;
  refreshBranch?: string;
}

/** A complete local inventory, or a refusal that names a repair. */
export type DefaultCaptureSetResult =
  | { status: "available"; commits: DefaultCaptureCommit[]; beforeRefresh: DefaultCaptureCommit[];
      baseRefreshed: boolean | null; warnings: string[] }
  | { status: "refused"; reason: string; remedy: string };

/** Compute uncaptured, non-merge commits relative to the configured base. */
export async function computeDefaultCaptureSet(input: DefaultCaptureSetInput): Promise<DefaultCaptureSetResult> {
  const { stdout } = await input.exec("git", ["remote"], { cwd: input.cwd });
  const origin = stdout.split(/\s+/u).includes("origin");
  const before = await resolveBaseRefs(input);
  const beforeWalk = before.length === 0 ? [] : await revisionWalk(input, before);
  let baseRefreshed: boolean | null = null;
  if (origin && input.refresh !== false) {
    const refresh = await boundedGitInvocation(input.exec, ["fetch", "origin",
      `+refs/heads/${input.baseBranch}:refs/remotes/origin/${input.baseBranch}`],
    DEFAULT_NETWORK_TIMEOUT_MS, { cwd: input.cwd });
    baseRefreshed = refresh.outcome === "ok";
    if (input.refreshBranch !== undefined) {
      await boundedGitInvocation(input.exec, ["fetch", "origin",
        `+refs/heads/${input.refreshBranch}:refs/remotes/origin/${input.refreshBranch}`],
      DEFAULT_NETWORK_TIMEOUT_MS, { cwd: input.cwd });
    }
  }
  const after = await resolveBaseRefs(input);
  if (after.length === 0) {
    const remedy = origin ? `git fetch origin +refs/heads/${input.baseBranch}:refs/remotes/origin/${input.baseBranch}`
      : `git branch ${input.baseBranch} <commit>`;
    return { status: "refused", reason: `No base ref resolves for ${input.baseBranch}.`, remedy };
  }
  const afterWalk = await revisionWalk(input, after);
  const stored = [...(input.captures ?? []), ...(input.exclusions ?? [])]
    .filter((value) => value.repository === input.repository);
  const shas = new Set(stored.map((value) => value.sha));
  const copyKeys = new Set(stored.flatMap((value) => value.copyKey === undefined ? [] : [value.copyKey]));
  const candidates = [...new Set([...beforeWalk, ...afterWalk])].filter((sha) => !shas.has(sha));
  const keys = await computeCopyKeys({ cwd: input.cwd, commits: candidates, execRaw: input.execRaw });
  const select = (walk: string[]): DefaultCaptureCommit[] => walk.flatMap((sha) => {
    if (shas.has(sha)) return [];
    const facts = keys.get(sha) ?? { authorTime: null, committerTime: null };
    if (facts.copyKey !== undefined && copyKeys.has(facts.copyKey)) return [];
    return [{ sha, ...facts }];
  });
  return { status: "available", commits: select(afterWalk), beforeRefresh: select(beforeWalk), baseRefreshed,
    warnings: baseRefreshed === false ? ["Base was not refreshed; captures use the base refs this clone holds."] : [] };
}

async function resolveBaseRefs(input: DefaultCaptureSetInput): Promise<string[]> {
  const refs = [`refs/heads/${input.baseBranch}`, `refs/remotes/origin/${input.baseBranch}`];
  const available: string[] = [];
  for (const ref of refs) {
    try {
      const result = await input.exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
        { cwd: input.cwd, objectAccess: "local-only" });
      if (result.stdout.trim() !== "") available.push(result.stdout.trim());
    } catch (error) {
      if (!(error instanceof Error && "exitCode" in error && error.exitCode === 1)) throw error;
    }
  }
  return [...new Set(available)];
}

async function revisionWalk(input: DefaultCaptureSetInput, bases: string[]): Promise<string[]> {
  const tips = [...(input.tips ?? ["HEAD"])];
  if (input.refreshBranch !== undefined) {
    const ref = `refs/remotes/origin/${input.refreshBranch}`;
    try {
      const result = await input.exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
        { cwd: input.cwd, objectAccess: "local-only" });
      if (result.stdout.trim() !== "") tips.push(result.stdout.trim());
    } catch (error) {
      if (!(error instanceof Error && "exitCode" in error && error.exitCode === 1)) throw error;
    }
  }
  const result = await input.exec("git", ["--no-replace-objects", "rev-list", "--no-merges", ...tips, "--not", ...bases],
    { cwd: input.cwd, objectAccess: "local-only" });
  return result.stdout.trim().split(/\s+/u).filter(Boolean);
}

/** The checkout's relationship to a work item's branch links. */
export type LinkedCheckoutBranch =
  | { kind: "linked"; link: BranchLink }
  | { kind: "no-link" }
  | { kind: "detached" }
  | { kind: "unlinked"; branch: string };

/** Resolve only the branch relation; each consumer owns its refusal policy. */
export async function resolveLinkedCheckoutBranch(input: {
  exec: GitExec; cwd: string; repository: string; branches: BranchLink[];
}): Promise<LinkedCheckoutBranch> {
  const links = input.branches.filter((link) => link.repository === input.repository);
  if (links.length === 0) return { kind: "no-link" };
  const result = await input.exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: input.cwd })
    .catch((error: unknown) => {
      if (error instanceof Error && "exitCode" in error && error.exitCode === 1) return null;
      throw error;
    });
  if (result === null) return { kind: "detached" };
  const branch = result.stdout.trim();
  const link = links.find((candidate) => candidate.ref.replace(/^refs\/heads\//u, "") === branch);
  return link === undefined ? { kind: "unlinked", branch } : { kind: "linked", link };
}
