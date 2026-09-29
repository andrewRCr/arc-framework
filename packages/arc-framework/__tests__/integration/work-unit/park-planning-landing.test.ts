/** Base-version orchestration tests for partial-protection park landing. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { createExecaGitExec } from "../../../src/lib/git/process-executor.js";
import { readGitBlobBytes } from "../../../src/lib/io-context.js";
import {
  createInRepoParkPlanningLandingContext,
  landParkPlanningTransition,
  validateCommittedParkPlanningTransition,
  type ParkLandingBaseSnapshot,
  type ParkLandingTransition,
  type ParkPlanningLandingContext,
} from "../../../src/lib/work-unit/park-planning-landing.js";
import { renderMetaProjectionFile } from "../../../src/lib/active/meta-reader.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

const transition: ParkLandingTransition = {
  commit: "b".repeat(40),
  name: "solo",
  files: [{
    path: validateManagedPath(".arc/backlog/planned/solo/meta-solo.md"),
    mode: "100644",
    oid: "c".repeat(40),
    bytes: new TextEncoder().encode("meta"),
  }],
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function committedPark(options: { branch?: string; extraPath?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "arc-park-transition-"));
  roots.push(root);
  const rawExec = createExecaGitExec();
  const exec: GitExec = (command, args, execOptions) => rawExec(command, args, { ...execOptions, cwd: root });
  await exec("git", ["init", "-b", "plan/sample"]);
  await exec("git", ["config", "user.name", "ARC Test"]);
  await exec("git", ["config", "user.email", "arc@example.test"]);
  await mkdir(join(root, ".arc/active"), { recursive: true });
  const meta = renderMetaProjectionFile("sample", {
    State: "Planning",
    Branch: options.branch ?? "plan/sample",
    Cohort: "[none]",
  });
  await writeFile(join(root, ".arc/active/meta-sample.md"), meta);
  await writeFile(join(root, ".arc/active/draft-sample.md"), "# Draft\n");
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "planning source"]);
  await mkdir(join(root, ".arc/backlog/planned/sample"), { recursive: true });
  await exec("git", ["mv", ".arc/active/meta-sample.md", ".arc/backlog/planned/sample/meta-sample.md"]);
  await exec("git", ["mv", ".arc/active/draft-sample.md", ".arc/backlog/planned/sample/draft-sample.md"]);
  if (options.extraPath !== undefined) await writeFile(join(root, options.extraPath), "unrelated\n");
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "park planning"]);
  const parkHead = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  return { root, exec, parkHead };
}

async function planningRepo() {
  const root = await mkdtemp(join(tmpdir(), "arc-park-transition-"));
  roots.push(root);
  const rawExec = createExecaGitExec();
  const exec: GitExec = (command, args, execOptions) => rawExec(command, args, { ...execOptions, cwd: root });
  await exec("git", ["init", "-b", "plan/sample"]);
  await exec("git", ["config", "user.name", "ARC Test"]);
  await exec("git", ["config", "user.email", "arc@example.test"]);
  await mkdir(join(root, ".arc/active"), { recursive: true });
  const meta = renderMetaProjectionFile("sample", {
    State: "Planning",
    Branch: "plan/sample",
    Cohort: "[none]",
  });
  await writeFile(join(root, ".arc/active/meta-sample.md"), meta);
  await writeFile(join(root, ".arc/active/draft-sample.md"), "# Draft\n");
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "planning source"]);
  return { root, exec };
}

function base(version: string, conflicts: readonly string[] = []): ParkLandingBaseSnapshot {
  return {
    version: canonicalDigest(version),
    headRef: "refs/heads/main",
    headOid: "a".repeat(40),
    indexTree: "d".repeat(40),
    stagedPaths: [],
    conflictingPaths: conflicts,
  };
}

function context(
  snapshots: readonly ParkLandingBaseSnapshot[],
  stagedVersions: string[],
): ParkPlanningLandingContext {
  let read = 0;
  return {
    readTransition: async () => ({ status: "resolved", transition }),
    readBase: async () => snapshots[read++] ?? snapshots.at(-1)!,
    stage: async (_source, expectedBase) => {
      stagedVersions.push(expectedBase.version);
      return { status: "staged" };
    },
  };
}

function productionHarness(options: {
  rejectConcurrentIndexReads?: boolean;
  symlinkParent?: string;
  tipAtRefPrepare?: string;
  baseTipAtRefPrepare?: string;
  removeOwnerAfterRefPrepare?: boolean;
} = {}): {
  context: ParkPlanningLandingContext;
  calls: Array<{ args: string[]; indexFile?: string }>;
  files: Map<string, Uint8Array>;
  setLockedTree(tree: string): void;
  setPlanTip(tip: string): void;
  setOwnerPresent(present: boolean): void;
} {
  const indexPath = "/repo/.git/index";
  const files = new Map<string, Uint8Array>([[indexPath, new TextEncoder().encode("index")]]);
  const directories = new Set(["/repo", "/repo/.git", "/repo/.arc"]);
  const symlinks = new Set(options.symlinkParent === undefined ? [] : [options.symlinkParent]);
  const calls: Array<{ args: string[]; indexFile?: string }> = [];
  const baseTree = "d".repeat(40);
  let lockedTree = baseTree;
  let baseTip = "a".repeat(40);
  let planTip = transition.commit;
  let ownerPresent = true;
  let baseLeaseHeld = false;
  let sourceLeaseHeld = false;
  let indexReadActive = false;
  const exec: GitExec = async (_cmd, args, execOptions) => {
    const indexRead = ["write-tree", "status", "diff", "ls-files"].includes(args[0] ?? "");
    if (options.rejectConcurrentIndexReads === true && indexRead) {
      if (indexReadActive) throw new Error("concurrent Git index read");
      indexReadActive = true;
      await Promise.resolve();
      indexReadActive = false;
    }
    calls.push({ args, ...(execOptions?.indexFile === undefined ? {} : { indexFile: execOptions.indexFile }) });
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      return { stdout: `${args[2]?.startsWith("refs/heads/plan/solo") === true ? planTip : baseTip}\n` };
    }
    if (args[0] === "symbolic-ref") return { stdout: "refs/heads/main\n" };
    if (args[0] === "rev-parse" && args[1] === "--path-format=absolute") {
      return { stdout: `${indexPath}\n` };
    }
    if (args[0] === "worktree" && args[1] === "list") {
      return {
        stdout: worktreePorcelainZ([
          `worktree /repo\nHEAD ${"a".repeat(40)}\nbranch refs/heads/main\n`,
          ...(ownerPresent
            ? [`worktree /repo-solo\nHEAD ${planTip}\nbranch refs/heads/plan/solo\n`]
            : []),
          "",
        ].join("\n")),
      };
    }
    if (args[0] === "write-tree") {
      return { stdout: `${execOptions?.indexFile === undefined ? baseTree : lockedTree}\n` };
    }
    if (args[0] === "status" || args[0] === "diff" || args[0] === "ls-files") return { stdout: "" };
    if (args[0] === "update-index") return { stdout: "" };
    throw new Error(`unexpected Git command: ${args.join(" ")}`);
  };
  const missing = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
  return {
    context: createInRepoParkPlanningLandingContext({
      cwd: "/repo",
      exec,
      readBlob: async () => null,
      prepareRefVerification: async (ref, expectedOid) => {
        if (ref === "refs/heads/main") {
          if (options.baseTipAtRefPrepare !== undefined) baseTip = options.baseTipAtRefPrepare;
          if (baseTip !== expectedOid) throw new Error("base ref verification rejected a moved tip");
          baseLeaseHeld = true;
          return { release: async () => { baseLeaseHeld = false; } };
        }
        if (options.tipAtRefPrepare !== undefined) planTip = options.tipAtRefPrepare;
        if (planTip !== expectedOid) throw new Error("source ref verification rejected a moved tip");
        sourceLeaseHeld = true;
        if (options.removeOwnerAfterRefPrepare === true) ownerPresent = false;
        return { release: async () => { sourceLeaseHeld = false; } };
      },
      fs: {
        lstat: async (path) => {
          if (symlinks.has(path)) {
            return { isDirectory: () => false, isSymbolicLink: () => true };
          }
          if (directories.has(path)) {
            return { isDirectory: () => true, isSymbolicLink: () => false };
          }
          throw missing(path);
        },
        mkdir: async (path) => {
          if (directories.has(path) || symlinks.has(path) || files.has(path)) throw new Error(`EEXIST: ${path}`);
          directories.add(path);
        },
        readFile: async (path) => {
          const content = files.get(path);
          if (content === undefined) throw missing(path);
          return content;
        },
        writeFile: async (path, content) => {
          if (directories.has(path) || symlinks.has(path) || files.has(path)) throw new Error(`EEXIST: ${path}`);
          files.set(path, content);
        },
        rename: async (from, to) => {
          if (to === indexPath && (!baseLeaseHeld || !sourceLeaseHeld)) {
            throw new Error("base and source ref leases were not held through install");
          }
          const content = files.get(from);
          if (content === undefined) throw missing(from);
          files.set(to, content);
          files.delete(from);
        },
        rm: async (path) => {
          files.delete(path);
        },
      },
    }),
    calls,
    files,
    setLockedTree: (tree) => { lockedTree = tree; },
    setPlanTip: (tip) => { planTip = tip; },
    setOwnerPresent: (present) => { ownerPresent = present; },
  };
}

describe("landParkPlanningTransition", () => {
  it("serializes base snapshot reads that share a Git index", async () => {
    const harness = productionHarness({ rejectConcurrentIndexReads: true });

    await expect(harness.context.readBase("solo", transition.files)).resolves.toMatchObject({
      indexTree: "d".repeat(40),
    });
  });

  it("uses a fresh non-conflicting base version when the base changed", async () => {
    const stagedVersions: string[] = [];
    const initial = base("initial");
    const fresh = base("fresh");

    const result = await landParkPlanningTransition(
      context([initial, fresh], stagedVersions),
      { name: "solo", commit: transition.commit },
    );

    expect(result).toEqual({
      status: "landed",
      commit: transition.commit,
      plannedPaths: [".arc/backlog/planned/solo/meta-solo.md"],
    });
    expect(stagedVersions).toEqual([fresh.version]);
  });

  it("refuses a changed base that gained a slug conflict without staging", async () => {
    const stagedVersions: string[] = [];
    const conflict = ".arc/backlog/provisional/solo/meta-solo.md";

    const result = await landParkPlanningTransition(
      context([base("initial"), base("fresh", [conflict])], stagedVersions),
      { name: "solo", commit: transition.commit },
    );

    expect(result).toEqual({
      status: "rejected",
      reason: `The base already contains a conflicting work-unit result: ${conflict}.`,
    });
    expect(stagedVersions).toEqual([]);
  });

  it("rejects an index change after the preflight while holding the compare-and-set lock", async () => {
    const harness = productionHarness();
    const expected = await harness.context.readBase("solo", transition.files);
    harness.setLockedTree("e".repeat(40));

    const result = await harness.context.stage(transition, expected);

    expect(result).toEqual({
      status: "rejected",
      reason: "The base changed during park landing; retry from the fresh base.",
    });
    expect(harness.calls.some((call) => call.args[0] === "update-index")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
  });

  it("rejects a planning-tip advance at stage time before writing", async () => {
    const harness = productionHarness();
    const expected = await harness.context.readBase("solo", transition.files);
    harness.setPlanTip("e".repeat(40));

    const result = await harness.context.stage(transition, expected);

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringMatching(/no longer.*exact local tip/iu) });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
    expect(harness.calls.some((call) => call.args[0] === "update-index")).toBe(false);
  });

  it("rejects owner disappearance at stage time before writing", async () => {
    const harness = productionHarness();
    const expected = await harness.context.readBase("solo", transition.files);
    harness.setOwnerPresent(false);

    const result = await harness.context.stage(transition, expected);

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringMatching(/no longer owned/iu) });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
    expect(harness.calls.some((call) => call.args[0] === "update-index")).toBe(false);
  });

  it("rejects a planning-tip advance after the initial recheck and rolls back staged files", async () => {
    const harness = productionHarness({ tipAtRefPrepare: "e".repeat(40) });
    const expected = await harness.context.readBase("solo", transition.files);

    const result = await harness.context.stage(transition, expected);

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringMatching(/moved tip/iu) });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
  });

  it("rejects a base-tip advance before installing the prepared index", async () => {
    const harness = productionHarness({ baseTipAtRefPrepare: "e".repeat(40) });
    const expected = await harness.context.readBase("solo", transition.files);

    const result = await harness.context.stage(transition, expected);

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringMatching(/base ref.*moved tip/iu) });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
  });

  it("rechecks owner presence under the prepared source-ref lease and rolls back on refusal", async () => {
    const harness = productionHarness({ removeOwnerAfterRefPrepare: true });
    const expected = await harness.context.readBase("solo", transition.files);

    const result = await harness.context.stage(transition, expected);

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringMatching(/no longer owned/iu) });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
  });

  it("rejects a symlinked landing parent before writing or staging", async () => {
    const harness = productionHarness({ symlinkParent: "/repo/.arc/backlog" });
    const expected = await harness.context.readBase("solo", transition.files);

    const result = await harness.context.stage(transition, expected);

    expect(result).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/parent is not a real directory/iu),
    });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(false);
    expect(harness.calls.some((call) => call.args[0] === "update-index")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
  });

  it("installs the lock-backed index only after exact files are created", async () => {
    const harness = productionHarness();
    const expected = await harness.context.readBase("solo", transition.files);

    const result = await harness.context.stage(transition, expected);

    expect(result).toEqual({ status: "staged" });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(true);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
    expect(harness.calls).toContainEqual(expect.objectContaining({
      args: expect.arrayContaining(["update-index", "--cacheinfo"]),
      indexFile: "/repo/.git/index.lock",
    }));
  });
});

describe("committed park transition validation", () => {
  it("accepts the exact structural relocation commit", async () => {
    const repo = await committedPark();

    await expect(validateCommittedParkPlanningTransition({
      cwd: repo.root,
      exec: repo.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo.root, ref, path),
    }, {
      name: "sample",
      branch: "plan/sample",
      commit: repo.parkHead,
    })).resolves.toMatchObject({ status: "resolved", transition: { commit: repo.parkHead } });
  });

  it("rejects unrelated changes in the park commit", async () => {
    const repo = await committedPark({ extraPath: "unrelated.txt" });

    await expect(validateCommittedParkPlanningTransition({
      cwd: repo.root,
      exec: repo.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo.root, ref, path),
    }, {
      name: "sample",
      branch: "plan/sample",
      commit: repo.parkHead,
    })).resolves.toMatchObject({ status: "rejected" });
  });

  it("rejects a later commit even when the planned result remains unchanged", async () => {
    const repo = await committedPark();
    await writeFile(join(repo.root, "later.txt"), "later\n");
    await repo.exec("git", ["add", "."]);
    await repo.exec("git", ["commit", "-m", "later work"]);
    const laterHead = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

    await expect(validateCommittedParkPlanningTransition({
      cwd: repo.root,
      exec: repo.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo.root, ref, path),
    }, {
      name: "sample",
      branch: "plan/sample",
      commit: laterHead,
    })).resolves.toMatchObject({ status: "rejected" });
  });

  it("rejects a relocation whose meta declares another branch without marking evidence absent", async () => {
    const repo = await committedPark({ branch: "plan/other" });

    const result = await validateCommittedParkPlanningTransition({
      cwd: repo.root,
      exec: repo.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo.root, ref, path),
    }, {
      name: "sample",
      branch: "plan/sample",
      commit: repo.parkHead,
    });

    expect(result).toMatchObject({ status: "rejected" });
    expect(result).not.toHaveProperty("evidence");
  });

  it("classifies an ordinary in-flight planning head as absent park evidence", async () => {
    const repo = await planningRepo();
    await writeFile(join(repo.root, ".arc/active/draft-sample.md"), "# Draft\n\nMore planning.\n");
    await repo.exec("git", ["add", "."]);
    await repo.exec("git", ["commit", "-m", "more planning"]);
    const head = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

    await expect(validateCommittedParkPlanningTransition({
      cwd: repo.root,
      exec: repo.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo.root, ref, path),
    }, {
      name: "sample",
      branch: "plan/sample",
      commit: head,
    })).resolves.toMatchObject({ status: "rejected", evidence: "absent" });
  });

  it("classifies a root commit as absent park evidence", async () => {
    const repo = await planningRepo();
    const head = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

    await expect(validateCommittedParkPlanningTransition({
      cwd: repo.root,
      exec: repo.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo.root, ref, path),
    }, {
      name: "sample",
      branch: "plan/sample",
      commit: head,
    })).resolves.toMatchObject({ status: "rejected", evidence: "absent" });
  });

  it("classifies a base-merge tip as absent park evidence", async () => {
    const repo = await planningRepo();
    await repo.exec("git", ["checkout", "-b", "side"]);
    await writeFile(join(repo.root, "side.txt"), "side\n");
    await repo.exec("git", ["add", "."]);
    await repo.exec("git", ["commit", "-m", "side work"]);
    await repo.exec("git", ["checkout", "plan/sample"]);
    await writeFile(join(repo.root, ".arc/active/draft-sample.md"), "# Draft\n\nDiverged.\n");
    await repo.exec("git", ["add", "."]);
    await repo.exec("git", ["commit", "-m", "diverge"]);
    await repo.exec("git", ["merge", "--no-edit", "side"]);
    const head = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

    await expect(validateCommittedParkPlanningTransition({
      cwd: repo.root,
      exec: repo.exec,
      readBlob: (ref, path) => readGitBlobBytes(repo.root, ref, path),
    }, {
      name: "sample",
      branch: "plan/sample",
      commit: head,
    })).resolves.toMatchObject({ status: "rejected", evidence: "absent" });
  });
});
