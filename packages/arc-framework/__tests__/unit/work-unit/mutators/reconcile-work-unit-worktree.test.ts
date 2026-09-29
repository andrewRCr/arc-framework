/**
 * Unit tests for the `reconcile-work-unit-worktree` mutator — the worktree-axis leg of the
 * WU relocation bundle. Git is mocked at the exec seam and the checkout hop is an
 * injected `chdir` spy; the filesystem is real (temp dirs) so the spawn leg's
 * ownership marker is written and read back, matching the sibling worktree-lib
 * tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";

import {
  nodeReconcileWorkUnitWorktreeFs,
  reconcileWorkUnitWorktree,
  resolveRenameWorktreeMove,
  type ReconcileWorkUnitWorktreeContext,
} from "../../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
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
  /** Make `git worktree move` fail as though the current directory is occupied. */
  failOccupiedMove?: boolean;
  /** Primary-side directories that should appear present to the harness-dir copy seam. */
  existingDirs?: readonly string[];
}

/**
 * Build a {@link ReconcileWorkUnitWorktreeContext} recording git invocations and locus
 * hops into one ordered event log, so spawn ordering and the self-teardown
 * hop-before-remove sequence can be asserted directly.
 */
function buildCtx(opts: MockOptions = {}): { ctx: ReconcileWorkUnitWorktreeContext; events: Event[] } {
  const events: Event[] = [];
  const existingDirs = new Set(opts.existingDirs ?? []);
  const exec: GitExec = async (cmd, args) => {
    events.push([cmd, ...args]);
    if (cmd !== "git" && opts.failPostCreate === true) throw new Error("exit 42");
    if (args[0] === "worktree" && args[1] === "move" && opts.failOccupiedMove === true) {
      throw Object.assign(new Error("worktree move failed"), {
        code: 1,
        stderr: "fatal: failed to move worktree: Permission denied",
      });
    }
    if (args[0] === "status") return { stdout: opts.status ?? "" };
    if (args[0] === "worktree" && args[1] === "list") return { stdout: opts.worktreeList ?? "" };
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return { stdout: `${opts.toplevel ?? ""}\n` };
    if (args[0] === "rev-parse" && args[1] === "--git-path") return { stdout: ".git/info/exclude\n" };
    return { stdout: "" };
  };
  const ctx: ReconcileWorkUnitWorktreeContext = {
    exec,
    chdir: (dir) => events.push(["chdir", dir]),
    serializeWorktreeOperation: async (_checkoutPath, operation) => operation(),
    fs: {
      pathExists: async () => false,
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
      readDir: async () => [],
    },
  };
  return { ctx, events };
}

/** Minimal `git worktree list --porcelain` with `primary` listed first. */
function porcelain(primary: string, linked: string): string {
  return [
    [
      `worktree ${primary}`,
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
    ].join("\0"),
    [
      `worktree ${linked}`,
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/feat/demo-wu",
    ].join("\0"),
  ].join("\0\0") + "\0\0";
}

describe("nodeReconcileWorkUnitWorktreeFs.copyDirectory", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-copy-harness-dir-"));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("preserves relative skill links inside the destination worktree", async () => {
    const primary = join(root, "primary");
    const destination = join(root, "linked");
    const relativeTarget = "../../.arc/system/.internal/skills/arc-inbox";
    const sourceSkill = join(primary, ".arc", "system", ".internal", "skills", "arc-inbox");
    const destinationSkill = join(destination, ".arc", "system", ".internal", "skills", "arc-inbox");
    await mkdir(sourceSkill, { recursive: true });
    await mkdir(destinationSkill, { recursive: true });
    await mkdir(join(primary, ".claude", "skills"), { recursive: true });
    await writeFile(join(sourceSkill, "SKILL.md"), "primary\n");
    await writeFile(join(destinationSkill, "SKILL.md"), "linked\n");
    await writeFile(join(primary, ".claude", "settings.json"), "{}\n");
    await symlink(relativeTarget, join(primary, ".claude", "skills", "arc-inbox"), "dir");

    await nodeReconcileWorkUnitWorktreeFs.copyDirectory(
      join(primary, ".claude"),
      join(destination, ".claude"),
    );

    const copiedLink = join(destination, ".claude", "skills", "arc-inbox");
    expect(await readlink(copiedLink)).toBe(relativeTarget);
    expect(await realpath(copiedLink)).toBe(await realpath(destinationSkill));
    expect(await readFile(join(copiedLink, "SKILL.md"), "utf8")).toBe("linked\n");
    expect(await readFile(join(destination, ".claude", "settings.json"), "utf8")).toBe("{}\n");
  });
});

describe("reconcileWorkUnitWorktree — spawn", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-reconcile-work-unit-worktree-"));
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

    const result = await reconcileWorkUnitWorktree(ctx, {
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
      marker: {
        spawnedByArc: true,
        wuName: "demo-wu",
        createdFor: { kind: "work-unit", name: "demo-wu" },
        spawningIdentity: "andrew",
      },
    });
  });

  it("absolutizes a repo-root-relative location template against the primary root", async () => {
    // Regression: the default `worktree.location_template` is repo-root-relative
    // (`../{repo}.{name}`), so the resolved value is relative. The spawn must return an
    // absolute path — a relative one becomes the executor's cwd, and the ceremony's staged
    // `git add ../<worktree>/…` then escapes the worktree (`fatal: … outside repository`).
    const { ctx, events } = buildCtx();
    const primaryPath = join(root, "primary");
    const expectedPath = join(root, "demo.demo-wu"); // resolve(primaryPath, "../demo.demo-wu")

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "spawn",
      branch: "plan/demo-wu",
      base: "main",
      locationTemplate: "../{repo}.{name}",
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
      primaryWorktreePath: primaryPath,
      now: Date.parse("2026-06-15T12:00:00.000Z"),
    });

    expect(result.mutation).toBe("spawn");
    if (result.mutation !== "spawn") throw new Error("expected spawn result");
    expect(isAbsolute(result.worktreePath)).toBe(true);
    expect(result).toMatchObject({ mutation: "spawn", worktreePath: expectedPath, branch: "plan/demo-wu" });
    // The `git worktree add` target is the absolute path, never the `..`-relative template.
    expect(events[0]).toEqual(["git", "worktree", "add", expectedPath, "-b", "plan/demo-wu", "main"]);

    const marker = await readWorktreeMarker(expectedPath);
    expect(marker).toMatchObject({
      kind: "present",
      marker: {
        spawnedByArc: true,
        wuName: "demo-wu",
        createdFor: { kind: "work-unit", name: "demo-wu" },
        spawningIdentity: "andrew",
      },
    });
  });

  it("returns an actionable notice when no post-create script is configured", async () => {
    const { ctx } = buildCtx();
    const template = join(root, "{repo}.{name}");

    const result = await reconcileWorkUnitWorktree(ctx, {
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

    await reconcileWorkUnitWorktree(ctx, {
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
      reconcileWorkUnitWorktree(ctx, {
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
      ["git", "worktree", "remove", "--force", expectedPath],
      ["git", "branch", "-D", "plan/demo-wu"],
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

    await reconcileWorkUnitWorktree(ctx, {
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

    await reconcileWorkUnitWorktree(ctx, {
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

    const result = await reconcileWorkUnitWorktree(ctx, {
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
      marker: {
        spawnedByArc: true,
        wuName: "demo-wu",
        createdFor: { kind: "work-unit", name: "demo-wu" },
        spawningIdentity: "andrew",
      },
    });
  });

  it("refuses a pre-existing destination before running git worktree add", async () => {
    const { ctx, events } = buildCtx();
    const template = join(root, "{repo}.{name}");
    const expectedPath = resolveWorktreeLocation({
      template,
      repo: "demo",
      name: "demo-wu",
      branch: "plan/demo-wu",
    });
    ctx.fs.pathExists = async (path) => path === expectedPath;

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "spawn",
      branch: "plan/demo-wu",
      base: "main",
      locationTemplate: template,
      repo: "demo",
      wuName: "demo-wu",
      spawningIdentity: "andrew",
    })).rejects.toThrow(/path collision/iu);
    expect(events).toEqual([]);
  });

});

describe("reconcileWorkUnitWorktree — spawn in place (--here)", () => {
  it("creates + checks out the branch in the current worktree (createBranch), no add, no marker", async () => {
    const { ctx, events } = buildCtx({ toplevel: "/work/primary" });

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "spawn",
      inPlace: true,
      branch: "plan/demo-wu",
      wuName: "demo-wu",
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

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "spawn",
      inPlace: true,
      branch: "feat/demo-wu",
      wuName: "demo-wu",
      createBranch: false,
    });

    expect(result).toEqual({ mutation: "spawn", worktreePath: "/work/primary", branch: "feat/demo-wu" });
    expect(events).toEqual([
      ["git", "checkout", "feat/demo-wu"],
      ["git", "rev-parse", "--show-toplevel"],
    ]);
  });

  it("returns no retired locus receipt for in-place placement", async () => {
    const { ctx } = buildCtx({ toplevel: "/work/primary" });

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "spawn",
      inPlace: true,
      branch: "plan/demo-wu",
      wuName: "demo-wu",
      createBranch: true,
    });
    expect(result).not.toHaveProperty("locus");
  });
});

describe("reconcileWorkUnitWorktree — rename move", () => {
  it("defers a POSIX-legal self-move before invoking the worktree mutator", async () => {
    const registered = "/work/project.old-name";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/new-name");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: "/work/project.old-name/packages/arc-framework",
    })).resolves.toEqual({
      status: "deferred-self-move",
      from: registered,
      to: "/work/project.new-name",
    });
  });

  it("derives an off-template destination from the registered path's final segment", async () => {
    const registered = "/custom/workspaces/project.old-name";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/new-name");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: "/work/primary",
    })).resolves.toEqual({
      status: "move",
      from: registered,
      to: "/custom/workspaces/project.new-name",
    });
  });

  it("rewrites the final old-slug occurrence when the registered leaf contains it more than once", async () => {
    const registered = "/custom/workspaces/old-name-tools.old-name";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/new-name");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: "/work/primary",
    })).resolves.toEqual({
      status: "move",
      from: registered,
      to: "/custom/workspaces/old-name-tools.new-name",
    });
  });

  it("accepts an already-moved path when the new slug contains the old slug", async () => {
    const registered = "/custom/workspaces/project.foo-bar";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/foo-bar");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/foo-bar",
      oldSlug: "foo",
      newSlug: "foo-bar",
      currentLocus: "/work/primary",
    })).resolves.toEqual({
      status: "already-moved",
      worktreePath: registered,
      sourceWorktreePath: "/custom/workspaces/project.foo",
    });
  });

  it("reports the source coordinate an interrupted move left a record under", async () => {
    const registered = "/custom/workspaces/project.new-name";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/new-name");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: "/work/primary",
    })).resolves.toEqual({
      status: "already-moved",
      worktreePath: registered,
      sourceWorktreePath: "/custom/workspaces/project.old-name",
    });
  });

  it("moves an old path when the old slug contains the new slug", async () => {
    const registered = "/custom/workspaces/project.foo-bar";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/foo");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/foo",
      oldSlug: "foo-bar",
      newSlug: "foo",
      currentLocus: "/work/primary",
    })).resolves.toEqual({
      status: "move",
      from: registered,
      to: "/custom/workspaces/project.foo",
    });
  });

  it("still rewrites a final old slug outside an earlier new-slug occurrence", async () => {
    const registered = "/custom/workspaces/foo-bar-tools.foo";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/foo-bar");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/foo-bar",
      oldSlug: "foo",
      newSlug: "foo-bar",
      currentLocus: "/work/primary",
    })).resolves.toEqual({
      status: "move",
      from: registered,
      to: "/custom/workspaces/foo-bar-tools.foo-bar",
    });
  });

  it("surfaces a registered leaf that contains no old-slug occurrence", async () => {
    const registered = "/custom/workspaces/manual-location";
    const listing = porcelain("/work/primary", registered).replace("feat/demo-wu", "feat/new-name");
    const { ctx } = buildCtx({ worktreeList: listing });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: "/work/primary",
    })).resolves.toEqual({ status: "unmatched", worktreePath: registered });
  });

  it("classifies an unregistered branch as an in-place subject", async () => {
    const { ctx } = buildCtx({ worktreeList: porcelain("/work/primary", "/work/other") });

    await expect(resolveRenameWorktreeMove(ctx.exec, {
      branch: "feat/new-name",
      oldSlug: "old-name",
      newSlug: "new-name",
      currentLocus: "/work/primary",
    })).resolves.toEqual({ status: "in-place" });
  });

  it("moves the current worktree, hops to its destination, and reports the new path", async () => {
    const { ctx, events } = buildCtx();

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "move",
      from: "/work/project.old-name",
      to: "/work/project.new-name",
      currentLocus: "/work/project.old-name/packages/arc-framework",
    });

    expect(result).toEqual({
      mutation: "move",
      from: "/work/project.old-name",
      to: "/work/project.new-name",
      locusHopped: true,
    });
    expect(events).toEqual([
      ["git", "worktree", "move", "/work/project.old-name", "/work/project.new-name"],
      ["chdir", "/work/project.new-name"],
    ]);
  });

  it("moves another worktree without changing the process locus", async () => {
    const { ctx, events } = buildCtx();

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "move",
      from: "/work/project.old-name",
      to: "/work/project.new-name",
      currentLocus: "/work/primary",
    })).resolves.toMatchObject({ mutation: "move", locusHopped: false });
    expect(events).toEqual([
      ["git", "worktree", "move", "/work/project.old-name", "/work/project.new-name"],
    ]);
  });

  it("returns a follow-up notice when the platform refuses an occupied self-move", async () => {
    const { ctx, events } = buildCtx({ failOccupiedMove: true });

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "move",
      from: "/work/project.old-name",
      to: "/work/project.new-name",
      currentLocus: "/work/project.old-name",
    });

    expect(result).toMatchObject({
      mutation: "move",
      locusHopped: false,
      followUpNotice: expect.stringMatching(/outside.*worktree/iu),
    });
    expect(events).toEqual([
      ["git", "worktree", "move", "/work/project.old-name", "/work/project.new-name"],
    ]);
  });

  it("propagates a self-move failure unrelated to directory occupancy", async () => {
    const { ctx } = buildCtx();
    ctx.exec = async () => {
      throw Object.assign(new Error("destination exists"), {
        code: 1,
        stderr: "fatal: destination path already exists",
      });
    };

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "move",
      from: "/work/project.old-name",
      to: "/work/project.new-name",
      currentLocus: "/work/project.old-name",
    })).rejects.toThrow(/destination exists/iu);
  });
});

describe("reconcileWorkUnitWorktree — teardown", () => {
  const clearSelection = (path: string) => ({
    kind: "clear" as const,
    checkout: {
      path,
      head: "2".repeat(40),
      branch: "feat/demo",
      detached: false,
      primary: false,
    },
    subject: { kind: "work-unit" as const, name: "demo" },
    markerGeneration: null,
  });

  it("removes an oracle-approved husk from outside after reconciling final user surfaces", async () => {
    const worktreePath = "/work/wt/demo";
    const { ctx, events } = buildCtx({
      status: " M ignored-by-approved-mode",
      worktreeList: porcelain("/work/primary", worktreePath),
    });

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus: "/work/primary",
      huskApproved: true,
    });

    expect(result).toEqual({ mutation: "teardown", worktreePath, locusHopped: false });
    expect(events).toEqual([
      ["git", "worktree", "list", "--porcelain", "-z"],
      ["git", "worktree", "remove", worktreePath],
    ]);
  });

  it("refuses an approved husk whose identity-global user surface cannot be reconciled", async () => {
    const worktreePath = "/work/wt/demo";
    const primary = "/work/primary";
    const { ctx, events } = buildCtx({ worktreeList: porcelain(primary, worktreePath) });
    const directory = (name: string) => ({ name, isDirectory: () => true, isFile: () => false });
    const file = (name: string) => ({ name, isDirectory: () => false, isFile: () => true });
    ctx.fs.readDir = async (path) => path.endsWith("/.arc/user")
      ? [directory("andrew")]
      : [file("FUTURE.md")];
    ctx.fs.readFile = async (path) => path.startsWith(worktreePath) ? "linked\n" : "primary\n";

    await expect(
      reconcileWorkUnitWorktree(ctx, {
        mutation: "teardown",
        worktreePath,
        currentLocus: primary,
        huskApproved: true,
      }),
    ).rejects.toThrow(/identity-global user surface/iu);

    expect(events).toEqual([["git", "worktree", "list", "--porcelain", "-z"]]);
  });

  it("refuses oracle-approved husk removal from inside the target", async () => {
    const worktreePath = "/work/wt/demo";
    const { ctx, events } = buildCtx();

    await expect(
      reconcileWorkUnitWorktree(ctx, {
        mutation: "teardown",
        worktreePath,
        currentLocus: `${worktreePath}/nested`,
        huskApproved: true,
      }),
    ).rejects.toThrow(/current detached worktree/iu);
    expect(events).toEqual([]);
  });

  it("removes a clean worktree without --force and without a locus hop (non-self)", async () => {
    const worktreePath = "/work/wt/demo";
    const { ctx, events } = buildCtx({ status: "", worktreeList: porcelain("/work/primary", worktreePath) });

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus: "/work/primary",
    });

    expect(result).toEqual({ mutation: "teardown", worktreePath, locusHopped: false });
    expect(events).toEqual([
      ["git", "status", "--porcelain"],
      ["git", "worktree", "list", "--porcelain", "-z"],
      ["git", "worktree", "remove", worktreePath],
    ]);
  });

  it("refuses a dirty worktree — no removal, no --force, no hop", async () => {
    const { ctx, events } = buildCtx({ status: " M packages/x.ts" });
    const worktreePath = "/work/wt/demo";

    await expect(
      reconcileWorkUnitWorktree(ctx, { mutation: "teardown", worktreePath, currentLocus: "/work/primary" }),
    ).rejects.toThrow(/dirty|clean/i);

    expect(events).toEqual([["git", "status", "--porcelain"]]);
  });

  it("reruns cleanliness inside the target-lock retirement callback", async () => {
    const worktreePath = "/work/wt/demo";
    const { ctx, events } = buildCtx({ worktreeList: porcelain("/work/primary", worktreePath) });
    const baseExec = ctx.exec;
    let statusReads = 0;
    ctx.exec = async (command, args, options) => {
      if (args[0] === "status" && statusReads++ > 0) return { stdout: " M changed.ts" };
      return await baseExec(command, args, options);
    };
    ctx.teardownWorktree = {
      retire: async (options) => {
        await options.revalidateLocal();
        await options.retireProjection();
      },
    };

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus: "/work/primary",
      authorization: {
        expectedSelection: clearSelection(worktreePath),
      },
    })).rejects.toThrow(/dirty worktree/iu);
    expect(events).not.toContainEqual(["git", "worktree", "remove", worktreePath]);
  });

  it("rereads the current locus inside the target-lock retirement callback", async () => {
    const worktreePath = "/work/wt/demo";
    const { ctx, events } = buildCtx({ worktreeList: porcelain("/work/primary", worktreePath) });
    ctx.readCurrentLocus = () => `${worktreePath}/nested`;
    ctx.teardownWorktree = {
      retire: async (options) => {
        await options.revalidateLocal();
        await options.retireProjection();
      },
    };

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus: "/work/primary",
      authorization: {
        expectedSelection: clearSelection(worktreePath),
      },
    })).rejects.toThrow(/current worktree/iu);
    expect(events).not.toContainEqual(["git", "worktree", "remove", worktreePath]);
  });

  it("hops the locus to the primary checkout before removing the worktree it runs from", async () => {
    const worktreePath = "/work/wt/demo";
    const primary = "/work/primary";
    const { ctx, events } = buildCtx({ status: "", worktreeList: porcelain(primary, worktreePath) });

    const result = await reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      // The transition executes from inside the worktree it is tearing down.
      currentLocus: join(worktreePath, "packages/arc-framework"),
    });

    expect(result).toEqual({ mutation: "teardown", worktreePath, locusHopped: true });
    expect(events).toEqual([
      ["git", "status", "--porcelain"],
      ["git", "worktree", "list", "--porcelain", "-z"],
      ["chdir", primary],
      ["git", "worktree", "remove", worktreePath],
    ]);
  });

  it("keeps self-teardown relocation outside the target before locked removal", async () => {
    const worktreePath = "/work/wt/demo";
    const primary = "/work/primary";
    const { ctx, events } = buildCtx({ status: "", worktreeList: porcelain(primary, worktreePath) });
    ctx.teardownWorktree = {
      retire: async (options) => {
        expect(events).toContainEqual(["chdir", primary]);
        await options.revalidateLocal();
        await options.retireProjection();
      },
    };

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus: join(worktreePath, "packages/arc-framework"),
      authorization: {
        expectedSelection: clearSelection(worktreePath),
      },
    })).resolves.toEqual({ mutation: "teardown", worktreePath, locusHopped: true });
    expect(events).toContainEqual(["git", "worktree", "remove", worktreePath]);
  });

  it("restores the original process locus when locked retirement fails before removal", async () => {
    const worktreePath = "/work/wt/demo";
    const currentLocus = join(worktreePath, "packages/arc-framework");
    const primary = "/work/primary";
    const { ctx, events } = buildCtx({ status: "", worktreeList: porcelain(primary, worktreePath) });
    ctx.fs.pathExists = async (path) => path === worktreePath;
    ctx.teardownWorktree = { retire: async () => { throw new Error("lock refused"); } };

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus,
      authorization: {
        expectedSelection: clearSelection(worktreePath),
      },
    })).rejects.toThrow(/lock refused/iu);
    expect(events).toContainEqual(["chdir", primary]);
    expect(events.at(-1)).toEqual(["chdir", currentLocus]);
  });

  it("reports the retained primary locus when failure follows physical removal", async () => {
    const worktreePath = "/work/wt/demo";
    const currentLocus = join(worktreePath, "packages/arc-framework");
    const primary = "/work/primary";
    const { ctx, events } = buildCtx({ status: "", worktreeList: porcelain(primary, worktreePath) });
    ctx.teardownWorktree = {
      retire: async (options) => {
        await options.revalidateLocal();
        await options.retireProjection();
        throw new Error("role pop failed");
      },
    };

    await expect(reconcileWorkUnitWorktree(ctx, {
      mutation: "teardown",
      worktreePath,
      currentLocus,
      authorization: {
        expectedSelection: clearSelection(worktreePath),
      },
    })).rejects.toThrow(new RegExp(`role pop failed; process locus remains at ${primary}`, "u"));
    expect(events.filter(([event]) => event === "chdir")).toEqual([["chdir", primary]]);
  });
});
