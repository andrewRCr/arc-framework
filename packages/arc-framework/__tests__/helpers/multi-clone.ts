/**
 * Multi-clone test harness.
 *
 * Builds a bare origin plus two working clones for cross-machine sync
 * regression coverage. By default both clones share a common starting commit
 * on `main`, and each clone has the ARC user-notes refspec configured so
 * `git fetch` round-trips notes without per-test setup.
 *
 * Designed to be reused by future cross-clone scenarios — clone identity,
 * extra `git config` overrides, and initial-commit seeding are all
 * parameterizable so consumers like the branch-gone signal probe can adapt
 * the topology without re-implementing the bootstrap.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { configureNotesRefspec } from "../../src/lib/git/index.js";
import { makeGitExec } from "./integration.js";

const execFileAsync = promisify(execFile);

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
    await rm(seed, { recursive: true, force: true });
  }
}

async function createClone(
  origin: string,
  prefix: string,
  options: Required<CloneSetupOptions>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await execFileAsync("git", ["clone", origin, dir]);
  await execFileAsync("git", ["config", "user.name", options.authorName], { cwd: dir });
  await execFileAsync("git", ["config", "user.email", options.authorEmail], { cwd: dir });
  for (const [key, value] of Object.entries(options.config)) {
    await execFileAsync("git", ["config", key, value], { cwd: dir });
  }
  await configureNotesRefspec(makeGitExec(dir));
  return dir;
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
    await Promise.allSettled(
      createdPaths.map((path) => rm(path, { recursive: true, force: true })),
    );
    createdPaths.length = 0;
  };

  try {
    const origin = await mkdtemp(join(tmpdir(), "arc-mc-origin-"));
    createdPaths.push(origin);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", origin]);

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
