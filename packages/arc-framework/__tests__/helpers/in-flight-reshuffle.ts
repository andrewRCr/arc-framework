import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import type { GitExec, GitExecOptions } from "../../src/lib/git/exec.js";

import { makeGitExec } from "./integration.js";
import { setupWorktreeSiblings } from "./multi-clone.js";
import { removeGitBackedDirs } from "./temp-repo.js";

const execFileAsync = promisify(execFile);

export interface CreateRemotePlanWorkUnitOptions {
  name: string;
  owner?: string;
  state?: string;
}

export interface CreateRemoteWorkUnitOptions extends CreateRemotePlanWorkUnitOptions {
  branch: string;
}

export type CreateLocalWorkUnitOptions = CreateRemoteWorkUnitOptions;

export interface SpawnWorktreeOptions {
  branch: string;
  fromRef: string;
}

export interface RenamePlanToTypeOptions {
  worktreePath: string;
  name: string;
  type: string;
  owner?: string;
  state?: string;
}

export interface PushBranchOptions {
  branch: string;
  sourceRef?: string;
  cwd?: string;
}

export interface RemoteBranchOptions {
  branch: string;
}

export interface RecreateRemoteBranchOptions extends RemoteBranchOptions {
  sourceRef: string;
}

export interface AdvanceRemoteBranchOptions extends RemoteBranchOptions {
  markerPath?: string;
}

export interface StandingStalePlanTopologyOptions {
  name: string;
  type?: string;
  owner?: string;
  state?: string;
}

export interface StandingStalePlanTopology {
  name: string;
  staleBranch: string;
  liveBranch: string;
  worktreePath: string;
}

export interface GitCall {
  cmd: string;
  args: readonly string[];
  options?: GitExecOptions;
}

export type GitCallMatcher = (call: GitCall) => boolean;

export interface GitCallBoundaryInjection {
  match: GitCallMatcher;
  run: (call: GitCall) => Promise<void> | void;
  timing?: "before" | "after";
  occurrence?: number;
}

export interface InFlightReshuffleSteps {
  spawnWorktree(options: SpawnWorktreeOptions): Promise<string>;
  renamePlanToType(options: RenamePlanToTypeOptions): Promise<string>;
  deleteRemoteBranch(options: RemoteBranchOptions): Promise<void>;
  recreateRemoteBranch(options: RecreateRemoteBranchOptions): Promise<void>;
  pushBranch(options: PushBranchOptions): Promise<void>;
  advanceRemoteBranch(options: AdvanceRemoteBranchOptions): Promise<void>;
}

export interface InFlightReshuffleFixture {
  origin: string;
  primary: string;
  sibling: string;
  primaryExec: GitExec;
  siblingExec: GitExec;
  steps: InFlightReshuffleSteps;
  createRemoteWorkUnit(options: CreateRemoteWorkUnitOptions): Promise<void>;
  createRemotePlanWorkUnit(options: CreateRemotePlanWorkUnitOptions): Promise<void>;
  createLocalWorkUnit(options: CreateLocalWorkUnitOptions): Promise<string>;
  createStandingStalePlanTopology(
    options: StandingStalePlanTopologyOptions,
  ): Promise<StandingStalePlanTopology>;
  withGitCallBoundaryInjections(exec: GitExec, injections: readonly GitCallBoundaryInjection[]): GitExec;
  cleanup(): Promise<void>;
}

export function gitArgsStartWith(prefix: readonly string[]): GitCallMatcher {
  return (call) =>
    prefix.every((expected, index) => call.args[index] === expected);
}

export async function setupInFlightReshuffleFixture(): Promise<InFlightReshuffleFixture> {
  const base = await setupWorktreeSiblings({
    siblingBranch: "chore/sibling-baseline",
    primary: { config: { "arc.identity": "andrew" } },
    sibling: { config: { "arc.identity": "andrew" } },
  });
  const ownedPaths: string[] = [];
  let advanceCounter = 0;
  const primaryExec = makeGitExec(base.primary);
  const siblingExec = makeGitExec(base.sibling);

  const cleanup = async (): Promise<void> => {
    let ownedRemovalError: unknown;
    try {
      await removeGitBackedDirs(ownedPaths);
      ownedPaths.length = 0;
    } catch (error) {
      ownedRemovalError = error;
    }
    let baseRemovalError: unknown;
    try {
      await base.cleanup();
    } catch (error) {
      baseRemovalError = error;
    }
    if (ownedRemovalError !== undefined) throw ownedRemovalError;
    if (baseRemovalError !== undefined) throw baseRemovalError;
  };

  const writeMeta = async (cwd: string, input: {
    name: string;
    branch: string;
    owner?: string;
    state?: string;
  }): Promise<void> => {
    const activeDir = join(cwd, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, `meta-${input.name}.md`),
      renderMetaFile(input.name, {
        State: input.state ?? "Active",
        Owner: input.owner ?? "andrew",
        Branch: input.branch,
        Class: "Light",
        Priority: "P3",
      }),
      "utf-8",
    );
  };

  const commitAll = async (cwd: string, message: string): Promise<void> => {
    await execFileAsync("git", ["add", ".arc/active"], { cwd });
    await execFileAsync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "commit", "-m", message],
      { cwd },
    );
  };

  const refreshRemoteTracking = async (branch: string): Promise<void> => {
    await execFileAsync(
      "git",
      ["fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`],
      { cwd: base.primary },
    );
  };

  const createRemoteWorkUnit = async (
    options: CreateRemoteWorkUnitOptions,
  ): Promise<void> => {
    await execFileAsync("git", ["switch", "main"], { cwd: base.primary });
    await execFileAsync("git", ["switch", "-c", options.branch], { cwd: base.primary });
    await writeMeta(base.primary, {
      name: options.name,
      branch: options.branch,
      owner: options.owner,
      state: options.state,
    });
    await commitAll(base.primary, `add ${options.name} plan work unit`);
    await execFileAsync("git", ["push", "origin", `HEAD:refs/heads/${options.branch}`], { cwd: base.primary });
    await refreshRemoteTracking(options.branch);
    await execFileAsync("git", ["switch", "main"], { cwd: base.primary });
    await execFileAsync("git", ["branch", "-D", options.branch], { cwd: base.primary });
  };

  const createRemotePlanWorkUnit = async (
    options: CreateRemotePlanWorkUnitOptions,
  ): Promise<void> => {
    await createRemoteWorkUnit({ ...options, branch: `plan/${options.name}` });
  };

  const createLocalWorkUnit = async (
    options: CreateLocalWorkUnitOptions,
  ): Promise<string> => {
    const worktreePath = await steps.spawnWorktree({
      branch: options.branch,
      fromRef: "main",
    });
    await writeMeta(worktreePath, options);
    await commitAll(worktreePath, `add ${options.name} local work unit`);
    return worktreePath;
  };

  const steps: InFlightReshuffleSteps = {
    async spawnWorktree(options): Promise<string> {
      const parent = await mkdtemp(join(tmpdir(), "arc-reshuffle-wt-"));
      ownedPaths.push(parent);
      const worktreePath = join(parent, sanitizeBranchForPath(options.branch));
      await execFileAsync(
        "git",
        ["worktree", "add", "-b", options.branch, worktreePath, options.fromRef],
        { cwd: base.primary },
      );
      await execFileAsync("git", ["config", "user.name", "Reshuffle Probe"], { cwd: worktreePath });
      await execFileAsync("git", ["config", "user.email", "reshuffle@example.com"], { cwd: worktreePath });
      return worktreePath;
    },

    async renamePlanToType(options): Promise<string> {
      const branch = `${options.type}/${options.name}`;
      await execFileAsync("git", ["branch", "-m", branch], { cwd: options.worktreePath });
      await writeMeta(options.worktreePath, {
        name: options.name,
        branch,
        owner: options.owner,
        state: options.state,
      });
      await commitAll(options.worktreePath, `rename ${options.name} work unit branch`);
      return branch;
    },

    async deleteRemoteBranch(options): Promise<void> {
      await execFileAsync("git", ["push", "origin", "--delete", options.branch], { cwd: base.primary });
      await execFileAsync("git", ["update-ref", "-d", `refs/remotes/origin/${options.branch}`], {
        cwd: base.primary,
      });
    },

    async recreateRemoteBranch(options): Promise<void> {
      await execFileAsync(
        "git",
        ["push", "origin", `${options.sourceRef}:refs/heads/${options.branch}`],
        { cwd: base.primary },
      );
      await refreshRemoteTracking(options.branch);
    },

    async pushBranch(options): Promise<void> {
      const sourceRef = options.sourceRef ?? options.branch;
      await execFileAsync(
        "git",
        ["push", "origin", `${sourceRef}:refs/heads/${options.branch}`],
        { cwd: options.cwd ?? base.primary },
      );
      await refreshRemoteTracking(options.branch);
    },

    async advanceRemoteBranch(options): Promise<void> {
      const tempBranch = `tmp/advance-${sanitizeBranchForPath(options.branch)}-${++advanceCounter}`;
      const markerPath = options.markerPath ?? `.arc/reshuffle-${sanitizeBranchForPath(options.branch)}.txt`;
      await execFileAsync("git", ["switch", "-c", tempBranch, `origin/${options.branch}`], { cwd: base.primary });
      await writeFile(join(base.primary, markerPath), `advanced ${options.branch}\n`, "utf-8");
      await execFileAsync("git", ["add", markerPath], { cwd: base.primary });
      await execFileAsync(
        "git",
        ["-c", "core.hooksPath=/dev/null", "commit", "-m", `advance ${options.branch}`],
        { cwd: base.primary },
      );
      await execFileAsync("git", ["push", "origin", `HEAD:refs/heads/${options.branch}`], { cwd: base.primary });
      await refreshRemoteTracking(options.branch);
      await execFileAsync("git", ["switch", "main"], { cwd: base.primary });
      await execFileAsync("git", ["branch", "-D", tempBranch], { cwd: base.primary });
    },
  };

  const createStandingStalePlanTopology = async (
    options: StandingStalePlanTopologyOptions,
  ): Promise<StandingStalePlanTopology> => {
    const type = options.type ?? "chore";
    const staleBranch = `plan/${options.name}`;
    await createRemotePlanWorkUnit(options);
    const planWorktree = await steps.spawnWorktree({
      branch: staleBranch,
      fromRef: `origin/${staleBranch}`,
    });
    const liveBranch = await steps.renamePlanToType({
      worktreePath: planWorktree,
      name: options.name,
      type,
      owner: options.owner,
      state: options.state,
    });
    return {
      name: options.name,
      staleBranch,
      liveBranch,
      worktreePath: planWorktree,
    };
  };

  return {
    origin: base.origin,
    primary: base.primary,
    sibling: base.sibling,
    primaryExec,
    siblingExec,
    steps,
    createRemoteWorkUnit,
    createRemotePlanWorkUnit,
    createLocalWorkUnit,
    createStandingStalePlanTopology,
    withGitCallBoundaryInjections,
    cleanup,
  };
}

function withGitCallBoundaryInjections(
  exec: GitExec,
  injections: readonly GitCallBoundaryInjection[],
): GitExec {
  const matchesByInjection = new Map<number, number>();
  const fired = new Set<number>();

  return async (cmd, args, options) => {
    const call: GitCall = { cmd, args, ...(options === undefined ? {} : { options }) };
    await fireInjections("before", call, injections, matchesByInjection, fired);
    const result = await exec(cmd, args, options);
    await fireInjections("after", call, injections, matchesByInjection, fired);
    return result;
  };
}

async function fireInjections(
  timing: "before" | "after",
  call: GitCall,
  injections: readonly GitCallBoundaryInjection[],
  matchesByInjection: Map<number, number>,
  fired: Set<number>,
): Promise<void> {
  for (const [index, injection] of injections.entries()) {
    if ((injection.timing ?? "before") !== timing) continue;
    if (fired.has(index)) continue;
    if (!injection.match(call)) continue;

    const count = (matchesByInjection.get(index) ?? 0) + 1;
    matchesByInjection.set(index, count);
    if (count !== (injection.occurrence ?? 1)) continue;

    await injection.run(call);
    fired.add(index);
  }
}

function sanitizeBranchForPath(branch: string): string {
  return branch.replace(/[^A-Za-z0-9._-]+/gu, "-");
}
