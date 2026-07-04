/**
 * Unit tests for the `reconcile-worktree` mutator — the worktree-axis leg of the
 * relocation bundle. Git is mocked at the exec seam and the locus-hop is an
 * injected `chdir` spy; the filesystem is real (temp dirs) so the spawn leg's
 * ownership marker is written and read back, matching the sibling worktree-lib
 * tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  reconcileWorktree,
  type ReconcileWorktreeContext,
} from "../../../../src/lib/work-unit/mutators/reconcile-worktree.js";
import { resolveWorktreeLocation } from "../../../../src/lib/git/worktree-location.js";
import { readWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";

/** One recorded event — a git invocation (`git ...`) or a locus hop (`chdir`). */
type Event = string[];

interface MockOptions {
  /** `git status --porcelain` output for the clean check (default clean). */
  status?: string;
  /** `git worktree list --porcelain` output for the primary-path resolution. */
  worktreeList?: string;
  /** `git rev-parse --show-toplevel` output for the in-place current-worktree resolution. */
  toplevel?: string;
  /** Make the configured post-create script fail. */
  failPostCreate?: boolean;
  /** Primary-side directories that should appear present to the harness-dir copy seam. */
  existingDirs?: readonly string[];
}

/**
 * Build a {@link ReconcileWorktreeContext} recording git invocations and locus
 * hops into one ordered event log, so spawn ordering and the self-teardown
 * hop-before-remove sequence can be asserted directly.
 */
function buildCtx(opts: MockOptions = {}): { ctx: ReconcileWorktreeContext; events: Event[] } {
  const events: Event[] = [];
  const existingDirs = new Set(opts.existingDirs ?? []);
  const exec: GitExec = async (cmd, args) => {
    events.push([cmd, ...args]);
    if (cmd !== "git" && opts.failPostCreate === true) throw new Error("exit 42");
    if (args[0] === "status") return { stdout: opts.status ?? "" };
    if (args[0] === "worktree" && args[1] === "list") return { stdout: opts.worktreeList ?? "" };
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return { stdout: `${opts.toplevel ?? ""}\n` };
    if (args[0] === "rev-parse" && args[1] === "--git-path") return { stdout: ".git/info/exclude\n" };
    return { stdout: "" };
  };
  const ctx: ReconcileWorktreeContext = {
    exec,
    chdir: (dir) => events.push(["chdir", dir]),
    fs: {
      directoryExists: async (path) => {
        events.push(["exists", path]);
        return existingDirs.has(path);
      },
      copyDirectory: async (source, destination) => {
        events.push(["copy", source, destination]);
      },
      readFile: async () => "",
      writeFile: async () => {},
      mkdir: async () => {},
    },
  };
  return { ctx, events };
}

/** Minimal `git worktree list --porcelain` with `primary` listed first. */
function porcelain(primary: string, linked: string): string {
  return [
    `worktree ${primary}`,
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/main",
    "",
    `worktree ${linked}`,
    "HEAD 2222222222222222222222222222222222222222",
    "branch refs/heads/feat/demo-wu",
    "",
  ].join("\n");
}

describe("reconcileWorktree — spawn", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-reconcile-worktree-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates the branch + worktree at the templated path and writes the ownership marker", async () => {
    const { ctx, events } = buildCtx();
    const template = join(root, "{repo}.{name}");
    const expectedPath = resolveWorktreeLocation({
      template,
      repo: "demo",
      name: "demo-wu",
      branch: "plan/demo-wu",
    });

    const result = await reconcileWorktree(ctx, {
      mutation: "spawn",
      branch: "plan/demo-wu",
      base: "main",
      locationTemplate: template,
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
      now: Date.parse("2026-06-15T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ mutation: "spawn", worktreePath: expectedPath, branch: "plan/demo-wu" });
    expect(events).toEqual([
      ["git", "worktree", "add", expectedPath, "-b", "plan/demo-wu", "main"],
      ["git", "rev-parse", "--git-path", "info/exclude"],
    ]);

    const marker = await readWorktreeMarker(expectedPath);
    expect(marker).toMatchObject({
      kind: "present",
      marker: { spawnedByArc: true, wuName: "demo-wu", spawningIdentity: "andrew" },
    });
  });

  it("returns an actionable notice when no post-create script is configured", async () => {
    const { ctx } = buildCtx();
    const template = join(root, "{repo}.{name}");

    const result = await reconcileWorktree(ctx, {
      mutation: "spawn",
      branch: "plan/demo-wu",
      base: "main",
      locationTemplate: template,
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
    });

    expect(result).toMatchObject({
      mutation: "spawn",
      postCreateNotice: expect.stringMatching(/deps must be provisioned/i),
    });
  });

  it("runs a configured post-create script after worktree add and before returning", async () => {
    const { ctx, events } = buildCtx();
    const template = join(root, "{repo}.{name}");
    const expectedPath = resolveWorktreeLocation({
      template,
      repo: "demo",
      name: "demo-wu",
      branch: "plan/demo-wu",
    });
    const postCreateCommand =
      process.platform === "win32"
        ? ["cmd.exe", "/d", "/s", "/c", "npm run wt:post-create"]
        : ["sh", "-c", "npm run wt:post-create"];

    await reconcileWorktree(ctx, {
      mutation: "spawn",
      branch: "plan/demo-wu",
      base: "main",
      locationTemplate: template,
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
      postCreateScript: "npm run wt:post-create",
    });

    expect(events).toEqual([
      ["git", "worktree", "add", expectedPath, "-b", "plan/demo-wu", "main"],
      postCreateCommand,
      ["git", "rev-parse", "--git-path", "info/exclude"],
    ]);
  });

  it("fails loud and writes no marker when the configured post-create script fails", async () => {
    const { ctx, events } = buildCtx({ failPostCreate: true });
    const template = join(root, "{repo}.{name}");
    const expectedPath = resolveWorktreeLocation({
      template,
      repo: "demo",
      name: "demo-wu",
      branch: "plan/demo-wu",
    });
    const postCreateCommand =
      process.platform === "win32"
        ? ["cmd.exe", "/d", "/s", "/c", "npm run wt:post-create"]
        : ["sh", "-c", "npm run wt:post-create"];

    await expect(
      reconcileWorktree(ctx, {
        mutation: "spawn",
        branch: "plan/demo-wu",
        base: "main",
        locationTemplate: template,
        repo: "demo",
        wuName: "demo-wu",
        spawningIdentity: "andrew",
        postCreateScript: "npm run wt:post-create",
      }),
    ).rejects.toThrow(/worktree\.post_create.*exit 42/i);

    expect(events).toEqual([
      ["git", "worktree", "add", expectedPath, "-b", "plan/demo-wu", "main"],
      postCreateCommand,
    ]);
    expect(await readWorktreeMarker(expectedPath)).toEqual({ kind: "absent" });
  });

  it("copies registered primary harness dirs after post-create provisioning", async () => {
    const primaryPath = join(root, "primary");
    const template = join(root, "{repo}.{name}");
    const expectedPath = resolveWorktreeLocation({
      template,
      repo: "demo",
      name: "demo-wu",
      branch: "plan/demo-wu",
    });
    const { ctx, events } = buildCtx({
      existingDirs: [join(primaryPath, ".codex"), join(primaryPath, ".claude")],
    });
    const postCreateCommand =
      process.platform === "win32"
        ? ["cmd.exe", "/d", "/s", "/c", "npm run wt:post-create"]
        : ["sh", "-c", "npm run wt:post-create"];

    await reconcileWorktree(ctx, {
      mutation: "spawn",
      branch: "plan/demo-wu",
      base: "main",
      locationTemplate: template,
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
      postCreateScript: "npm run wt:post-create",
      registeredHarnessDirs: ".codex,.claude,.missing",
      primaryWorktreePath: primaryPath,
    });

    expect(events).toEqual([
      ["git", "worktree", "add", expectedPath, "-b", "plan/demo-wu", "main"],
      postCreateCommand,
      ["exists", join(primaryPath, ".codex")],
      ["copy", join(primaryPath, ".codex"), join(expectedPath, ".codex")],
      ["exists", join(primaryPath, ".claude")],
      ["copy", join(primaryPath, ".claude"), join(expectedPath, ".claude")],
      ["exists", join(primaryPath, ".missing")],
      ["git", "rev-parse", "--git-path", "info/exclude"],
    ]);
  });

  it("leaves unregistered primary harness dirs untouched", async () => {
    const primaryPath = join(root, "primary");
    const template = join(root, "{repo}.{name}");
    const expectedPath = resolveWorktreeLocation({
      template,
      repo: "demo",
      name: "demo-wu",
      branch: "plan/demo-wu",
    });
    const { ctx, events } = buildCtx({
      existingDirs: [join(primaryPath, ".codex"), join(primaryPath, ".unregistered-harness")],
    });

    await reconcileWorktree(ctx, {
      mutation: "spawn",
      branch: "plan/demo-wu",
      base: "main",
      locationTemplate: template,
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
      registeredHarnessDirs: ".codex",
      primaryWorktreePath: primaryPath,
    });

    expect(events).toEqual([
      ["git", "worktree", "add", expectedPath, "-b", "plan/demo-wu", "main"],
      ["exists", join(primaryPath, ".codex")],
      ["copy", join(primaryPath, ".codex"), join(expectedPath, ".codex")],
      ["git", "rev-parse", "--git-path", "info/exclude"],
    ]);
  });

  it("re-attaches an existing branch (bare add, no -b) and still marks the worktree for resume", async () => {
    const { ctx, events } = buildCtx();
    const template = join(root, "{repo}.{name}");
    const expectedPath = resolveWorktreeLocation({
      template,
      repo: "demo",
      name: "demo-wu",
      branch: "feat/demo-wu",
    });

    const result = await reconcileWorktree(ctx, {
      mutation: "spawn",
      createBranch: false,
      branch: "feat/demo-wu",
      // Supplied to satisfy the spawn op, but ignored on re-attach — asserted absent from the add below.
      base: "feat/demo-wu",
      locationTemplate: template,
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
      now: Date.parse("2026-06-15T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ mutation: "spawn", worktreePath: expectedPath, branch: "feat/demo-wu" });
    expect(events).toEqual([
      ["git", "worktree", "add", expectedPath, "feat/demo-wu"],
      ["git", "rev-parse", "--git-path", "info/exclude"],
    ]);

    const marker = await readWorktreeMarker(expectedPath);
    expect(marker).toMatchObject({
      kind: "present",
      marker: { spawnedByArc: true, wuName: "demo-wu", spawningIdentity: "andrew" },
    });
  });
});

describe("reconcileWorktree — spawn in place (--here)", () => {
  it("creates + checks out the branch in the current worktree (createBranch), no add, no marker", async () => {
    const { ctx, events } = buildCtx({ toplevel: "/work/primary" });

    const result = await reconcileWorktree(ctx, {
      mutation: "spawn",
      inPlace: true,
      branch: "plan/demo-wu",
      createBranch: true,
    });

    expect(result).toEqual({ mutation: "spawn", worktreePath: "/work/primary", branch: "plan/demo-wu" });
    expect(events).toEqual([
      ["git", "checkout", "-b", "plan/demo-wu"],
      ["git", "rev-parse", "--show-toplevel"],
    ]);
  });

  it("attaches an existing branch in the current worktree (no -b) for resume", async () => {
    const { ctx, events } = buildCtx({ toplevel: "/work/primary" });

    const result = await reconcileWorktree(ctx, {
      mutation: "spawn",
      inPlace: true,
      branch: "feat/demo-wu",
      createBranch: false,
    });

    expect(result).toEqual({ mutation: "spawn", worktreePath: "/work/primary", branch: "feat/demo-wu" });
    expect(events).toEqual([
      ["git", "checkout", "feat/demo-wu"],
      ["git", "rev-parse", "--show-toplevel"],
    ]);
  });
});

describe("reconcileWorktree — teardown", () => {
  it("removes a clean worktree without --force and without a locus hop (non-self)", async () => {
    const { ctx, events } = buildCtx({ status: "" });
    const worktreePath = "/work/wt/demo";

    const result = await reconcileWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus: "/work/primary",
    });

    expect(result).toEqual({ mutation: "teardown", worktreePath, locusHopped: false });
    expect(events).toEqual([
      ["git", "status", "--porcelain"],
      ["git", "worktree", "remove", worktreePath],
    ]);
  });

  it("refuses a dirty worktree — no removal, no --force, no hop", async () => {
    const { ctx, events } = buildCtx({ status: " M packages/x.ts" });
    const worktreePath = "/work/wt/demo";

    await expect(
      reconcileWorktree(ctx, { mutation: "teardown", worktreePath, currentLocus: "/work/primary" }),
    ).rejects.toThrow(/dirty|clean/i);

    expect(events).toEqual([["git", "status", "--porcelain"]]);
  });

  it("hops the locus to the primary checkout before removing the worktree it runs from", async () => {
    const worktreePath = "/work/wt/demo";
    const primary = "/work/primary";
    const { ctx, events } = buildCtx({ status: "", worktreeList: porcelain(primary, worktreePath) });

    const result = await reconcileWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      // The transition executes from inside the worktree it is tearing down.
      currentLocus: join(worktreePath, "packages/arc-framework"),
    });

    expect(result).toEqual({ mutation: "teardown", worktreePath, locusHopped: true });
    expect(events).toEqual([
      ["git", "status", "--porcelain"],
      ["git", "worktree", "list", "--porcelain"],
      ["chdir", primary],
      ["git", "worktree", "remove", worktreePath],
    ]);
  });
});
