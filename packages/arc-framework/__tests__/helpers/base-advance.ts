/**
 * Advance a protected base branch under a checkout that stays where it is.
 *
 * Two phases, because a movement kind is a property of the *intersection* of the branch's own diff
 * with the base's, not of the advance alone. {@link arrangeBranchSide} puts the branch ahead with a
 * real commit; {@link advanceBase} moves the base behind it. The shipped overlap analyzer
 * short-circuits to an empty result unless the branch is both ahead and behind, so a caller that
 * skips the first phase observes nothing whatever the second one touched.
 *
 * The base side is plumbing only — a temporary index, `commit-tree`, and a push — so it never reads
 * or writes the caller's index, working tree, or checked-out branch. Building it through the real
 * index would commit whatever the caller had staged and leave the checkout dirty.
 *
 * Type-only imports from `src/` are erased at runtime, so this module stays reachable from the
 * spawned lane as well as the in-process one.
 *
 * @module
 */

import { execFile } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import type { GitExec } from "../../src/lib/git/exec.js";

const execFileAsync = promisify(execFile);

/** The default remote whose base ref is authoritative for an advance. */
const DEFAULT_REMOTE = "origin";
/** The default protected base branch. */
const DEFAULT_BASE = "main";

/**
 * The argument-array Git execution seam, imported for its type alone.
 *
 * A type-only import is erased at build time, so this module keeps no runtime coupling to `src/`
 * and stays reachable from the spawned lane.
 */
export type GitExecLike = GitExec;

/**
 * How an advance intersects the branch's own diff.
 *
 * Deliberately excludes an unavailable remote read, which is not an advance at all — see
 * {@link withUnavailableBaseRead} and {@link writeUnavailableBaseReadShim}.
 */
export type BaseMovementKind =
  | "disjoint"
  | "overlapping-substantive"
  | "overlapping-regenerable-only"
  | "evidence-neutral-intersection";

/** The paths each side of a movement kind touches. */
export interface MovementPathSets {
  readonly branch: readonly string[];
  readonly base: readonly string[];
}

/** A checkout and the remote coordinates its base lives at. */
export interface BaseCoordinates {
  /** A checkout whose configured remote reaches the base; never switched or dirtied. */
  readonly cwd: string;
  readonly base?: string;
  readonly remote?: string;
}

/** One base advance over an explicit path set. */
export interface BaseAdvanceOptions extends BaseCoordinates {
  readonly paths: readonly string[];
  readonly message?: string;
  /** Distinguishes successive advances so each writes different content. */
  readonly generation?: number;
  /**
   * Further checkouts that must see the advance through their own remote-tracking ref.
   *
   * A sibling worktree shares the primary's ref store and needs no entry here; a separate clone
   * has its own and does.
   */
  readonly observers?: readonly string[];
}

/** One branch-side arrangement over an explicit path set. */
export interface BranchSideOptions {
  readonly cwd: string;
  readonly paths: readonly string[];
  readonly message?: string;
}

/** The advanced base, as the remote now holds it. */
export interface BaseAdvanceResult {
  readonly head: string;
  readonly paths: readonly string[];
}

/**
 * Resolve the path sets that realize one movement kind for one work unit.
 *
 * The literals track the shipped classifier: the tracked readiness projection is the single
 * regenerable project document, a work unit's own companions are evidence-neutral, and anything
 * else is reviewable. The caller's test asserts that mapping against the classifier itself rather
 * than trusting this table.
 *
 * @param kind - The intersection shape the advance should produce.
 * @param workUnit - Slug whose own artifacts count as evidence-neutral.
 * @returns The branch-side and base-side path sets.
 */
export function movementPaths(kind: BaseMovementKind, workUnit: string): MovementPathSets {
  switch (kind) {
    case "disjoint":
      return { branch: ["src/branch-only-surface.ts"], base: ["src/base-only-surface.ts"] };
    case "overlapping-substantive":
      return { branch: ["src/shared-surface.ts"], base: ["src/shared-surface.ts"] };
    case "overlapping-regenerable-only":
      return { branch: [".arc/backlog/ROADMAP.md"], base: [".arc/backlog/ROADMAP.md"] };
    case "evidence-neutral-intersection":
      return {
        branch: [`.arc/active/notes-${workUnit}.md`],
        base: [`.arc/active/notes-${workUnit}.md`],
      };
    default:
      return assertNever(kind);
  }
}

/**
 * Put the caller's current branch ahead of its base by committing over a path set.
 *
 * A real add-and-commit rather than plumbing: the branch side has to reach the index and working
 * tree, because the staged subject a Candidate reads is diffed from the index. A plumbing
 * `update-ref` would move HEAD past both and leave the checkout dirty.
 *
 * @param options - The checkout, the paths to change, and an optional message.
 */
export async function arrangeBranchSide(options: BranchSideOptions): Promise<void> {
  const message = options.message ?? "arrange branch side";
  for (const path of options.paths) {
    await writeRepositoryFile(options.cwd, path, `branch side\n${message}\n${path}\n`);
  }
  await git(options.cwd, ["add", "--", ...options.paths]);
  await git(options.cwd, ["-c", "core.hooksPath=/dev/null", "commit", "-m", message], authorEnvironment());
}

/**
 * Advance the remote base over a path set without touching the caller's checkout.
 *
 * @param options - The checkout, base coordinates, and paths the advance should change.
 * @returns The advanced base head and the paths it changed.
 */
export async function advanceBase(options: BaseAdvanceOptions): Promise<BaseAdvanceResult> {
  const remote = options.remote ?? DEFAULT_REMOTE;
  const base = options.base ?? DEFAULT_BASE;
  const message = options.message ?? "advance base";
  const generation = options.generation ?? 0;

  // Parent from the freshly fetched remote head: a second advance built on a stale local ref
  // would be a non-fast-forward push.
  await git(options.cwd, ["fetch", remote, base]);
  const parent = (await git(options.cwd, ["rev-parse", "--verify", `refs/remotes/${remote}/${base}`])).trim();

  const indexFile = join(
    await makeScratchDirectory(options.cwd),
    `advance-index-${generation}-${process.pid}`,
  );
  const indexEnvironment = { GIT_INDEX_FILE: indexFile };
  await git(options.cwd, ["read-tree", parent], indexEnvironment);
  for (const path of options.paths) {
    const blob = (await gitWithInput(
      options.cwd,
      ["hash-object", "-w", "--stdin"],
      `base side\n${message}\ngeneration ${generation}\n${path}\n`,
    )).trim();
    await git(
      options.cwd,
      ["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`],
      indexEnvironment,
    );
  }
  const tree = (await git(options.cwd, ["write-tree"], indexEnvironment)).trim();
  const head = (await git(
    options.cwd,
    ["commit-tree", tree, "-p", parent, "-m", message],
    authorEnvironment(),
  )).trim();

  // Push by remote name. A URL-rewritten origin needs no special handling — Git resolves
  // `insteadOf` wherever it consumes the URL, and `remote get-url` already reports the rewritten
  // value — so naming the remote is simply the form that stays correct for every origin shape.
  await git(options.cwd, [
    "-c", "core.hooksPath=/dev/null", "push", remote, `${head}:refs/heads/${base}`,
  ]);

  // A separate clone keeps its own remote-tracking refs, so the push above never reaches it.
  // A boundary that resolves the base by reading the tracking ref with local-only object access
  // would otherwise observe no movement at all, and record a tolerant result for a base that
  // never moved from its point of view.
  for (const observer of options.observers ?? []) {
    await git(observer, ["fetch", remote, `+refs/heads/${base}:refs/remotes/${remote}/${base}`]);
  }

  return { head, paths: [...options.paths] };
}

/**
 * Render the base-side advance as one argv step for a persistent shell sequence.
 *
 * Probing lanes that close inside one anchored sequence cannot call {@link advanceBase} between
 * steps, and hand-rolling the advance there is exactly what this helper exists to prevent.
 *
 * @param options - The same options {@link advanceBase} takes.
 * @returns A sequence entry performing the identical advance in its own process.
 */
export function advanceBaseStep(options: BaseAdvanceOptions): {
  readonly command: readonly string[];
  readonly cwd: string;
} {
  // The step runs from the package root, not the repository under advance: its loader resolves
  // from the working directory, and a fixture repository has no node modules of its own. The
  // repository it advances travels in the serialized options instead.
  return {
    command: [
      process.execPath,
      "--import",
      "tsx",
      new URL("base-advance-step.ts", import.meta.url).pathname,
      JSON.stringify(options),
    ],
    cwd: new URL("../../", import.meta.url).pathname,
  };
}

/**
 * Wrap an execution seam so the base read fails where the boundary performs it.
 *
 * The failure has to land when the boundary fires rather than before it, so that the analyzer
 * reports its typed unavailable result instead of the fixture throwing during setup.
 *
 * @param exec - The seam the boundary will read through.
 * @param coordinates - The base whose read should fail.
 * @returns A seam that rejects that one read and delegates everything else.
 */
export function withUnavailableBaseRead(
  exec: GitExecLike,
  coordinates: { readonly base?: string; readonly remote?: string } = {},
): GitExecLike {
  const remote = coordinates.remote ?? DEFAULT_REMOTE;
  const base = coordinates.base ?? DEFAULT_BASE;
  return async (command, args, options) => {
    if (isBaseFetch(args, remote, base)) {
      throw new Error(`fatal: unable to access '${remote}': Could not resolve host: ${remote}`);
    }
    return await exec(command, args, options);
  };
}

/**
 * Write a `git` shim that fails one base read when armed, and exec the real binary otherwise.
 *
 * The spawned lane has no injectable seam, so an unavailable remote read reaches a spawned verb
 * only through the executable it resolves. Arming is an environment flag so the fixture's own
 * setup fetches still succeed and only the boundary's invocation fails.
 *
 * The shim reports a transport failure rather than a missing ref: the rejection classifier maps a
 * missing-remote-ref fetch onto its own outcome, which is a different observation.
 *
 * @param options - Directory to write the shim into, and the base whose read should fail.
 * @returns The environment that puts the shim on `PATH`, and the variable that arms it.
 */
export async function writeUnavailableBaseReadShim(options: {
  readonly dir: string;
  readonly base?: string;
  readonly remote?: string;
}): Promise<{ readonly env: Record<string, string>; readonly armVariable: string }> {
  const remote = options.remote ?? DEFAULT_REMOTE;
  const base = options.base ?? DEFAULT_BASE;
  const armVariable = "ARC_TEST_BASE_READ_UNAVAILABLE";
  await mkdir(options.dir, { recursive: true });
  // Resolve the real binary by re-exporting a PATH the shim directory is absent from, so the
  // `exec` below cannot recurse into this script.
  const realPath = (process.env["PATH"] ?? "")
    .split(delimiter)
    .filter((entry) => entry !== options.dir)
    .join(delimiter);
  const shim = join(options.dir, "git");
  await writeFile(shim, [
    "#!/bin/sh",
    `if [ "\${${armVariable}:-0}" = "1" ] && [ "$1" = "fetch" ]; then`,
    "  for argument in \"$@\"; do",
    "    case \"$argument\" in",
    // The base reaches the fetch as a bare branch name or inside a refspec, depending on caller.
    `      ${base}|*refs/heads/${base}*|*${remote}/${base}*)`,
    `        echo "fatal: unable to access '${remote}': Could not resolve host: ${remote}" >&2`,
    "        exit 128",
    "        ;;",
    "    esac",
    "  done",
    "fi",
    `export PATH=${shellQuote(realPath)}`,
    "exec git \"$@\"",
    "",
  ].join("\n"));
  await chmod(shim, 0o755);
  return {
    env: { PATH: `${options.dir}${delimiter}${realPath}` },
    armVariable,
  };
}

/** True when this argv is the fetch that materializes the configured base. */
function isBaseFetch(args: readonly string[], remote: string, base: string): boolean {
  if (args[0] !== "fetch") return false;
  const rest = args.slice(1);
  if (!rest.includes(remote)) return false;
  return rest.some((argument) => argument === base || argument.includes(`refs/heads/${base}`));
}

async function makeScratchDirectory(cwd: string): Promise<string> {
  const dir = join(cwd, ".git", "arc-test-advance");
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeRepositoryFile(cwd: string, path: string, content: string): Promise<void> {
  const absolute = join(cwd, path);
  const separator = absolute.lastIndexOf("/");
  if (separator > 0) await mkdir(absolute.slice(0, separator), { recursive: true });
  await writeFile(absolute, content, "utf-8");
}

/** A plain temp repository may carry no identity configuration at all. */
function authorEnvironment(): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: "Base Advance",
    GIT_AUTHOR_EMAIL: "base-advance@example.invalid",
    GIT_COMMITTER_NAME: "Base Advance",
    GIT_COMMITTER_EMAIL: "base-advance@example.invalid",
  };
}

async function git(
  cwd: string,
  args: readonly string[],
  environment: Record<string, string> = {},
): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd,
    env: { ...process.env, ...environment },
  });
  return stdout;
}

function gitWithInput(cwd: string, args: readonly string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      [...args],
      { cwd, env: { ...process.env } },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
    child.stdin?.end(input);
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled movement kind: ${String(value)}`);
}
