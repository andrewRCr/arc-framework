/**
 * No-checkout remote-ref reader for the in-flight oracle.
 *
 * Reads WU metas straight off remote refs without a working-tree checkout:
 * `git ls-remote` supplies live branch membership (the liveness oracle), a
 * bounded fetch makes a never-seen-locally branch's objects readable, and
 * `git show <ref>:<path>` reads meta content. Derivation runs over a *pruned*
 * view — local remote-tracking refs intersected with live membership — so a
 * branch whose upstream was deleted never surfaces as phantom in-flight.
 *
 * Every network read is bounded by a timeout and degrades when the remote is
 * unreachable: membership degrades to empty, the candidate-ref fetch to a
 * failure flag, and the pruned view to the last-known local refs. The reader
 * returns facts and never throws on a network miss.
 *
 * @module
 */

import type { GitExec } from "./exec.js";

/** Default remote whose tracking refs back the no-checkout in-flight reads. */
const DEFAULT_REMOTE = "origin";

/** Ref → commit object id snapshot, serialized as a plain object for JSON callers. */
export type RefTipMap = Record<string, string>;

/** Local refs that can contribute to the in-flight input set. */
export interface LocalInFlightRefSnapshot {
  /** Remote-tracking branches, keyed by short branch name (no remote prefix). */
  remoteTracking: RefTipMap;
  /** Local branch heads, keyed by short branch name. */
  localHeads: RefTipMap;
}

/** Outcome of reading local in-flight refs. */
export interface LocalInFlightRefSnapshotResult {
  /** False when `git for-each-ref` failed and `refs` is an empty degrade value. */
  ok: boolean;
  refs: LocalInFlightRefSnapshot;
}

/**
 * Default bound for a single network read. The spec measured `ls-remote` ≈
 * 0.45s on a good link; the budget covers the slow-link tail while keeping a
 * miss non-blocking. Callers may override per invocation.
 */
export const DEFAULT_NETWORK_TIMEOUT_MS = 5000;

/** Outcome of a timeout-bounded git read — `ok: false` on timeout or error. */
interface BoundedResult {
  ok: boolean;
  stdout: string;
}

/**
 * Run a git command under an abort-signal timeout. Any failure — the timeout
 * firing or a network/exec error — resolves to `{ ok: false }`; the caller owns
 * the degrade. Mirrors the bounded-fetch shape in `worktree-sync.ts`.
 */
async function runBounded(
  exec: GitExec,
  args: string[],
  timeoutMs: number,
): Promise<BoundedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const { stdout } = await exec("git", args, { signal: controller.signal });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse `git ls-remote --heads` output into short branch → sha tips. */
function parseLiveMembership(stdout: string): RefTipMap {
  const tips: RefTipMap = {};
  for (const line of stdout.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const sha = line.slice(0, tab).trim();
    const ref = line.slice(tab + 1).trim();
    if (!ref.startsWith("refs/heads/")) continue;
    tips[ref.slice("refs/heads/".length)] = sha;
  }
  return tips;
}

/**
 * Read live remote membership, bounded. `ok` distinguishes "unreachable"
 * (degrade target decided by the caller) from a genuinely empty remote.
 */
async function readLiveMembership(
  exec: GitExec,
  timeoutMs: number,
  remote: string,
): Promise<{ ok: boolean; tips: RefTipMap }> {
  const res = await runBounded(exec, ["ls-remote", "--heads", remote], timeoutMs);
  if (!res.ok) return { ok: false, tips: {} };
  return { ok: true, tips: parseLiveMembership(res.stdout) };
}

function emptyLocalRefSnapshot(): LocalInFlightRefSnapshot {
  return { remoteTracking: {}, localHeads: {} };
}

function parseLocalRefSnapshot(stdout: string, remote: string): LocalInFlightRefSnapshot {
  const remoteTracking: RefTipMap = {};
  const localHeads: RefTipMap = {};
  const fullRemotePrefix = `refs/remotes/${remote}/`;
  const shortRemotePrefix = `${remote}/`;
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const [refNameRaw, shaRaw] = trimmed.split("\t");
    if (refNameRaw === undefined) continue;
    const refName = refNameRaw.trim();
    const sha = shaRaw?.trim() ?? "";

    if (refName.startsWith(fullRemotePrefix)) {
      const branch = refName.slice(fullRemotePrefix.length);
      if (branch !== "" && branch !== "HEAD") remoteTracking[branch] = sha;
      continue;
    }
    if (refName.startsWith(shortRemotePrefix)) {
      const branch = refName.slice(shortRemotePrefix.length);
      if (branch !== "" && branch !== "HEAD") remoteTracking[branch] = sha;
      continue;
    }
    if (refName.startsWith("refs/remotes/")) continue;
    if (refName === remote || refName.endsWith("/HEAD")) continue;

    if (refName.startsWith("refs/heads/")) {
      const branch = refName.slice("refs/heads/".length);
      if (branch !== "") localHeads[branch] = sha;
      continue;
    }
    // Backward-compatible parser path for older tests / injected stubs using
    // `%(refname:short)` over only the remote-tracking namespace.
    if (refName !== "") remoteTracking[refName] = sha;
  }
  return { remoteTracking, localHeads };
}

/** Read local remote-tracking and branch-head tips. */
export async function readLocalInFlightRefSnapshot(
  exec: GitExec,
  remote = DEFAULT_REMOTE,
): Promise<LocalInFlightRefSnapshotResult> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", [
      "for-each-ref",
      "--format=%(refname)\t%(objectname)",
      `refs/remotes/${remote}`,
      "refs/heads",
    ]));
  } catch {
    return { ok: false, refs: emptyLocalRefSnapshot() };
  }
  return { ok: true, refs: parseLocalRefSnapshot(stdout, remote) };
}

/** Inputs for {@link listLiveRemoteBranches}. */
export interface ListLiveRemoteBranchesOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Remote to inspect. Defaults to `origin`. */
  remote?: string;
  /** Per-read network timeout in ms. Defaults to {@link DEFAULT_NETWORK_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Enumerate live remote branch names via `git ls-remote --heads <remote>`.
 *
 * This is the membership truth — what branches exist on `origin` right now,
 * read with no checkout. Names are returned short (no `refs/heads/` prefix).
 * The read is bounded by a timeout and degrades to an empty list when the
 * remote is unreachable.
 *
 * @param options - Executor and optional network timeout.
 * @returns Live remote branch names, in `ls-remote` order; `[]` when unreachable.
 */
export async function listLiveRemoteBranches(
  options: ListLiveRemoteBranchesOptions,
): Promise<string[]> {
  const { exec, remote = DEFAULT_REMOTE, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS } = options;
  return Object.keys((await readLiveMembership(exec, timeoutMs, remote)).tips);
}

/** Inputs for {@link listPrunedRemoteTrackingBranches}. */
export interface ListPrunedRemoteTrackingBranchesOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Remote to inspect. Defaults to `origin`. */
  remote?: string;
  /** Per-read network timeout in ms. Defaults to {@link DEFAULT_NETWORK_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * List local remote-tracking branches pruned to live membership.
 *
 * Reads `refs/remotes/origin/*` locally (`git for-each-ref`) and intersects it
 * with live `ls-remote` membership: a local remote-tracking ref whose upstream
 * is gone (a merged-and-deleted branch lingering on disk) is excluded, so it
 * never surfaces as phantom in-flight — independent of whether a prune has run.
 * When live membership is unreachable, the prune can't run, so it degrades to
 * the full local set (last-known view) rather than nuking everything to empty.
 *
 * @param options - Executor and optional network timeout.
 * @returns Live-backed local remote-tracking branch names.
 */
export async function listPrunedRemoteTrackingBranches(
  options: ListPrunedRemoteTrackingBranchesOptions,
): Promise<string[]> {
  return (await resolveInFlightBranchSet(options)).branches;
}

/** Inputs for {@link resolveInFlightBranchSet}. */
export interface ResolveInFlightBranchSetOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Remote to inspect. Defaults to `origin`. */
  remote?: string;
  /** Skip the live-membership network read; use local remote-tracking refs as-is. */
  localOnly?: boolean;
  /** Per-read network timeout in ms. Defaults to {@link DEFAULT_NETWORK_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** The branch set to derive in-flight entries from, with a reachability signal. */
export interface InFlightBranchSet {
  /** Branch short-names — pruned to live membership when reachable, local-only otherwise. */
  branches: string[];
  /** Candidate ref tips keyed as `<remote>/<branch>` for the selected branch set. */
  refs: RefTipMap;
  /** Live remote tips from the single bounded membership read; empty when unreachable/local-only. */
  liveRefs: RefTipMap;
  /**
   * True only when live membership was read and pruned against (online and
   * reachable). False both when the remote is unreachable and in `localOnly`
   * mode — the caller distinguishes those by whether it requested `localOnly`.
   */
  reachable: boolean;
}

/**
 * Resolve the in-flight branch set, surfacing whether live membership backed it.
 *
 * The reachability-aware sibling of {@link listPrunedRemoteTrackingBranches}: an
 * explicit-view command degrades to its last-rendered cache when `reachable` is
 * false, while `localOnly` skips the network read entirely for a fast offline
 * view over the last-known local remote-tracking refs.
 *
 * @param options - Executor, optional `localOnly`, and optional network timeout.
 * @returns The branch set and whether live membership was read.
 */
export async function resolveInFlightBranchSet(
  options: ResolveInFlightBranchSetOptions,
): Promise<InFlightBranchSet> {
  const { exec, remote = DEFAULT_REMOTE, localOnly = false, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS } = options;
  const local = await readLocalInFlightRefSnapshot(exec, remote);
  if (!local.ok) return { branches: [], refs: {}, liveRefs: {}, reachable: false };
  return resolveInFlightBranchSetFromLocalRefs({ exec, refs: local.refs, remote, localOnly, timeoutMs });
}

/** Inputs for resolving the branch set from an already-read local ref snapshot. */
export interface ResolveInFlightBranchSetFromLocalRefsOptions extends ResolveInFlightBranchSetOptions {
  /** Pre-read local ref snapshot, so callers can compare it for mutation-window agreement. */
  refs: LocalInFlightRefSnapshot;
}

/** Resolve the in-flight branch set from a pinned local ref snapshot. */
export async function resolveInFlightBranchSetFromLocalRefs(
  options: ResolveInFlightBranchSetFromLocalRefsOptions,
): Promise<InFlightBranchSet> {
  const { exec, refs, remote = DEFAULT_REMOTE, localOnly = false, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS } = options;
  const local = Object.keys(refs.remoteTracking);
  const refTipsFor = (branches: readonly string[]): RefTipMap =>
    Object.fromEntries(branches.map((branch) => [`${remote}/${branch}`, refs.remoteTracking[branch] ?? ""]));
  if (localOnly) return { branches: local, refs: refTipsFor(local), liveRefs: {}, reachable: false };
  const membership = await readLiveMembership(exec, timeoutMs, remote);
  if (!membership.ok) return { branches: local, refs: refTipsFor(local), liveRefs: {}, reachable: false };
  const live = new Set(Object.keys(membership.tips));
  const branches = local.filter((branch) => live.has(branch));
  return {
    branches,
    refs: refTipsFor(branches),
    liveRefs: Object.fromEntries(Object.entries(membership.tips).map(([branch, sha]) => [`${remote}/${branch}`, sha])),
    reachable: true,
  };
}

/** Inputs for {@link fetchRefBounded}. */
export interface FetchRefBoundedOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Remote to fetch from. Defaults to `origin`. */
  remote?: string;
  /** Remote branch to fetch so its objects become readable via `git show`. */
  branch: string;
  /** Network timeout in ms. Defaults to {@link DEFAULT_NETWORK_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Bounded-fetch a candidate ref so a never-seen-locally branch's objects become
 * present and readable (the meta of a WU in flight only on another machine).
 * On success the fetched tip is at `FETCH_HEAD`. Degrades to `false` on timeout
 * or unreachable remote — the caller simply skips that live-only candidate.
 *
 * @param options - Executor, branch to fetch, and optional timeout.
 * @returns `true` when the fetch succeeded, `false` on timeout/unreachable.
 */
export async function fetchRefBounded(options: FetchRefBoundedOptions): Promise<boolean> {
  const { exec, remote = DEFAULT_REMOTE, branch, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS } = options;
  return (await runBounded(exec, ["fetch", remote, branch], timeoutMs)).ok;
}

/** Inputs for {@link readMetaAtRef}. */
export interface ReadMetaAtRefOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Ref to read from — a remote-tracking ref or `FETCH_HEAD` after a fetch. */
  ref: string;
  /** Repo-relative meta path to read at the ref (e.g. `.arc/active/meta-x.md`). */
  metaPath: string;
}

/**
 * Read a meta file's content off a ref via `git show <ref>:<path>`, no checkout.
 *
 * Returns the file content, or `null` when the path is absent on that ref — the
 * signal a branch carries no WU meta (an errand `chore/<slug>` branch, `main`,
 * or a WU whose meta moved). A `git show` failure is the absent signal, so it
 * resolves to `null` rather than throwing. The read is local once the objects
 * are present (via a prior fetch or tracking ref), so it is not timeout-bounded.
 *
 * @param options - Executor, ref, and the meta path to read.
 * @returns The meta content, or `null` when the path is absent on the ref.
 */
export async function readMetaAtRef(options: ReadMetaAtRefOptions): Promise<string | null> {
  const { exec, ref, metaPath } = options;
  try {
    const { stdout } = await exec("git", ["show", `${ref}:${metaPath}`]);
    return stdout;
  } catch {
    return null;
  }
}

/** Inputs for {@link listMetaPathsAtRef}. */
export interface ListMetaPathsAtRefOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Ref to enumerate — a remote-tracking ref, local branch ref, or `FETCH_HEAD`. */
  ref: string;
}

/** Result of enumerating active meta files at a ref. */
export interface ListMetaPathsAtRefResult {
  /** False when the tree could not be enumerated; true even when no metas are present. */
  ok: boolean;
  /** Repo-relative `.arc/active/meta-*.md` paths present directly under active/. */
  paths: string[];
}

const ACTIVE_META_RE = /^\.arc\/active\/meta-[^/]+\.md$/u;

/**
 * List active meta paths present at a ref without checking it out.
 *
 * Empty success means the ref carries no active metas. Failure is distinct
 * because derivation consumers need to warn rather than treat an unreadable ref
 * as definitively meta-less.
 *
 * @param options - Executor and ref to inspect.
 * @returns Enumeration result with an explicit success bit.
 */
export async function listMetaPathsAtRef(
  options: ListMetaPathsAtRefOptions,
): Promise<ListMetaPathsAtRefResult> {
  const { exec, ref } = options;
  try {
    const { stdout } = await exec("git", ["ls-tree", "-r", "--name-only", ref, ".arc/active/"]);
    return {
      ok: true,
      paths: stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((path) => ACTIVE_META_RE.test(path)),
    };
  } catch {
    return { ok: false, paths: [] };
  }
}
