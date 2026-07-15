/**
 * Multi-clone test harness.
 *
 * Builds a bare origin plus two working clones for cross-machine sync
 * regression coverage. By default both clones share a common starting commit
 * on `main`. Notes propagation stays explicit through the `arc user` helpers
 * each test invokes.
 *
 * Designed to be reused by future cross-clone scenarios — clone identity,
 * extra `git config` overrides, and initial-commit seeding are all
 * parameterizable so consumers like the branch-gone signal probe can adapt
 * the topology without re-implementing the bootstrap.
 */

import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { removeGitBackedDir } from "./temp-repo.js";

const execFileAsync = promisify(execFile);

/**
 * Disable background auto-gc on a repo: its repacking races temp-repo teardown
 * (ENOTEMPTY on `.git/objects/pack`). Worktrees inherit it via the shared
 * common dir, so configuring the backing clone/origin covers its siblings.
 */
async function disableAutoGc(cwd: string): Promise<void> {
  await execFileAsync("git", ["config", "gc.auto", "0"], { cwd });
}

/** Per-clone setup overrides. */
export interface CloneSetupOptions {
  /** `user.name` recorded in this clone's git config. */
  authorName?: string;
  /** `user.email` recorded in this clone's git config. */
  authorEmail?: string;
  /**
   * Extra `git config` key/value pairs applied after clone. Useful for setting
   * `arc.identity` or other ARC-aware keys per clone.
   */
  config?: Record<string, string>;
}

/** Options controlling harness setup. */
export interface MultiCloneOptions {
  /**
   * Seed the bare origin with one initial commit on `main` before either
   * clone is created. Default: `true`. Set `false` when the test needs to
   * bootstrap origin itself.
   */
  initialCommit?: boolean;
  /** Configuration for clone A. */
  cloneA?: CloneSetupOptions;
  /** Configuration for clone B. */
  cloneB?: CloneSetupOptions;
}

/** Options controlling a same-machine sibling-worktree setup. */
export interface WorktreeSiblingsOptions {
  /**
   * Seed the bare origin with one initial commit on `main` before the primary
   * clone is created. Default: `true`.
   */
  initialCommit?: boolean;
  /** Configuration for the primary worktree. */
  primary?: CloneSetupOptions;
  /** Configuration for the sibling worktree. */
  sibling?: CloneSetupOptions;
  /** Branch created for the sibling worktree. Default: `sibling`. */
  siblingBranch?: string;
}

/** Result of a successful harness setup. */
export interface MultiClone {
  /** Absolute path to the bare repo serving as origin. */
  origin: string;
  /** Absolute path to clone A's working directory. */
  cloneA: string;
  /** Absolute path to clone B's working directory. */
  cloneB: string;
  /** Tear down all temp directories created by the harness. Idempotent. */
  cleanup: () => Promise<void>;
}

/** Result of a successful same-machine sibling-worktree setup. */
export interface WorktreeSiblings {
  /** Absolute path to the bare repo serving as origin. */
  origin: string;
  /** Absolute path to the primary worktree. */
  primary: string;
  /** Absolute path to the sibling worktree sharing the primary's git common dir. */
  sibling: string;
  /** Tear down all temp directories created by the harness. Idempotent. */
  cleanup: () => Promise<void>;
}

/** One git notes entry as returned by `git notes list`: blob id plus annotated commit. */
export interface NoteEntry {
  blob: string;
  commit: string;
}

/** Manual barrier for deterministic step-controlled interleavings. */
export interface ManualStepBarrier {
  /** Resolves once the controlled step reaches the barrier. */
  reached: Promise<void>;
  /** Called by the controlled operation when it reaches the barrier. */
  arrive: () => Promise<void>;
  /** Releases the controlled operation past the barrier. */
  release: () => void;
}

/** A step in a deterministic operation driver. */
export interface ControlledStep {
  name: string;
  run: () => Promise<void>;
  /** Optional barrier reached after this step completes. */
  after?: ManualStepBarrier;
}

const DEFAULT_CLONE_A: Required<CloneSetupOptions> = {
  authorName: "Clone A",
  authorEmail: "clone-a@example.com",
  config: {},
};

const DEFAULT_CLONE_B: Required<CloneSetupOptions> = {
  authorName: "Clone B",
  authorEmail: "clone-b@example.com",
  config: {},
};

function resolveCloneOptions(
  defaults: Required<CloneSetupOptions>,
  overrides: CloneSetupOptions | undefined,
): Required<CloneSetupOptions> {
  return {
    authorName: overrides?.authorName ?? defaults.authorName,
    authorEmail: overrides?.authorEmail ?? defaults.authorEmail,
    config: { ...defaults.config, ...(overrides?.config ?? {}) },
  };
}

async function seedOrigin(origin: string): Promise<void> {
  const seed = await mkdtemp(join(tmpdir(), "arc-mc-seed-"));
  try {
    await execFileAsync("git", ["init", "--initial-branch=main", seed]);
    await disableAutoGc(seed);
    await execFileAsync("git", ["config", "user.name", "Multi-Clone Seed"], { cwd: seed });
    await execFileAsync("git", ["config", "user.email", "seed@example.com"], { cwd: seed });
    await execFileAsync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "commit", "--allow-empty", "-m", "initial commit"],
      { cwd: seed },
    );
    await execFileAsync("git", ["remote", "add", "origin", origin], { cwd: seed });
    await execFileAsync("git", ["push", "origin", "main"], { cwd: seed });
  } finally {
    await removeGitBackedDir(seed);
  }
}

async function createClone(
  origin: string,
  prefix: string,
  options: Required<CloneSetupOptions>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync("git", ["clone", origin, dir]);
  await disableAutoGc(dir);
  await execFileAsync("git", ["config", "user.name", options.authorName], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", options.authorEmail], { cwd: dir });
  for (const [key, value] of Object.entries(options.config)) {
    await execFileAsync("git", ["config", key, value], { cwd: dir });
  }
  return dir;
}

async function configureWorktree(
  dir: string,
  options: Required<CloneSetupOptions>,
): Promise<void> {
  await execFileAsync("git", ["config", "user.name", options.authorName], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", options.authorEmail], { cwd: dir });
  for (const [key, value] of Object.entries(options.config)) {
    await execFileAsync("git", ["config", key, value], { cwd: dir });
  }
}

/**
 * Build a fresh bare-origin + two-clone topology for cross-machine tests.
 *
 * Lifecycle: callers must invoke `cleanup()` (typically in `afterEach` or a
 * `try { ... } finally` wrapper) to remove the temp directories.
 *
 * @param options - Harness setup overrides.
 * @returns Handles for origin and both clones plus a `cleanup` function.
 */
export async function setupMultiClone(
  options: MultiCloneOptions = {},
): Promise<MultiClone> {
  const initialCommit = options.initialCommit ?? true;
  const cloneAOptions = resolveCloneOptions(DEFAULT_CLONE_A, options.cloneA);
  const cloneBOptions = resolveCloneOptions(DEFAULT_CLONE_B, options.cloneB);

  const createdPaths: string[] = [];
  const cleanup = async (): Promise<void> => {
    await Promise.allSettled(createdPaths.map((path) => removeGitBackedDir(path)));
    createdPaths.length = 0;
  };

  try {
    const origin = await mkdtemp(join(tmpdir(), "arc-mc-origin-"));
    createdPaths.push(origin);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", origin]);
    await disableAutoGc(origin);

    if (initialCommit) {
      await seedOrigin(origin);
    }

    const cloneA = await createClone(origin, "arc-mc-cloneA-", cloneAOptions);
    createdPaths.push(cloneA);

    const cloneB = await createClone(origin, "arc-mc-cloneB-", cloneBOptions);
    createdPaths.push(cloneB);

    return { origin, cloneA, cloneB, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/**
 * Build a fresh bare-origin + primary/sibling-worktree topology for same-machine
 * tests. The two worktrees share one git common dir, so notes refs and lockfiles
 * are shared exactly as they are for concurrent local ARC worktrees.
 */
export async function setupWorktreeSiblings(
  options: WorktreeSiblingsOptions = {},
): Promise<WorktreeSiblings> {
  if (options.initialCommit === false) {
    throw new Error("setupWorktreeSiblings requires initialCommit because the sibling worktree branches from main.");
  }
  const primaryOptions = resolveCloneOptions(DEFAULT_CLONE_A, options.primary);
  const siblingOptions = resolveCloneOptions(DEFAULT_CLONE_B, options.sibling);
  const siblingBranch = options.siblingBranch ?? "sibling";

  const createdPaths: string[] = [];
  const cleanup = async (): Promise<void> => {
    await Promise.allSettled(createdPaths.map((path) => removeGitBackedDir(path)));
    createdPaths.length = 0;
  };

  try {
    const origin = await mkdtemp(join(tmpdir(), "arc-wt-origin-"));
    createdPaths.push(origin);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", origin]);
    await disableAutoGc(origin);

    await seedOrigin(origin);

    const primary = await createClone(origin, "arc-wt-primary-", primaryOptions);
    createdPaths.push(primary);

    const worktreeParent = await mkdtemp(join(tmpdir(), "arc-wt-siblings-"));
    createdPaths.push(worktreeParent);
    const sibling = join(worktreeParent, "sibling");
    await execFileAsync("git", ["worktree", "add", "-b", siblingBranch, sibling, "main"], { cwd: primary });
    await configureWorktree(sibling, siblingOptions);

    return { origin, primary, sibling, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Create a manual barrier for deterministic step-controlled tests. */
export function createManualStepBarrier(): ManualStepBarrier {
  let markReached: () => void = () => {};
  let releaseStep: () => void = () => {};
  const reached = new Promise<void>((resolve) => {
    markReached = resolve;
  });
  const releasePromise = new Promise<void>((resolve) => {
    releaseStep = resolve;
  });
  return {
    reached,
    arrive: async () => {
      markReached();
      await releasePromise;
    },
    release: releaseStep,
  };
}

/** Run named async steps, pausing after any step carrying a barrier. */
export async function runControlledSteps(steps: ControlledStep[]): Promise<void> {
  for (const step of steps) {
    await step.run();
    if (step.after) {
      await step.after.arrive();
    }
  }
}

/** Current tip of a ref, or `null` when it does not resolve. */
export async function readRefTip(cwd: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--verify", ref], { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** List note entries on a notes ref, sorted by annotated commit. */
export async function listNoteEntries(cwd: string, ref: string): Promise<NoteEntry[]> {
  try {
    const { stdout } = await execFileAsync("git", ["notes", `--ref=${ref}`, "list"], { cwd });
    return stdout
      .split("\n")
      .map((line) => {
        const [blob, commit] = line.trim().split(/\s+/u);
        return blob && commit ? { blob, commit } : null;
      })
      .filter((entry): entry is NoteEntry => entry !== null)
      .sort((a, b) => a.commit.localeCompare(b.commit));
  } catch {
    return [];
  }
}
