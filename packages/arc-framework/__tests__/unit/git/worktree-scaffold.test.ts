/**
 * Unit tests for the spawn scaffolding primitive — create-new wiring that
 * runs `git worktree add`, then scaffolds the meta, SESSION-NOTES seed, and
 * ownership marker into the new worktree root, rolling back on a post-add
 * failure. Git is mocked at the exec seam; the filesystem is real (temp dirs),
 * matching the sibling worktree-lib tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { spawnWorktree } from "../../../src/lib/git/worktree-scaffold.js";
import { resolveWorktreeLocation } from "../../../src/lib/git/worktree-location.js";
import { readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { createUserIOContext } from "../../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../../src/lib/paths.js";
import type { GitExec } from "../../../src/lib/git/index.js";
import type { UserIOContext } from "../../../src/commands/user/types.js";

/** A recording mock exec that resolves every call (success). */
function recordingExec(): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: GitExec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    return { stdout: "" };
  };
  return { exec, calls };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("spawnWorktree — create-new happy path", () => {
  let root: string;
  let calls: string[][];
  let io: UserIOContext;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-spawn-worktree-"));
    const rec = recordingExec();
    calls = rec.calls;
    io = { ...createUserIOContext(), exec: rec.exec };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function params() {
    return {
      wuName: "my-feature",
      spawningIdentity: "andrew",
      baseBranch: "main",
      locationTemplate: join(root, "{repo}.{branch}"),
      repo: "demo",
      nextAction: "Begin planning",
      now: Date.parse("2026-05-27T12:00:00.000Z"),
    };
  }

  it("creates the branch + worktree at the templated path off the resolved base", async () => {
    const result = await spawnWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      params(),
    );

    const expectedPath = resolveWorktreeLocation({
      template: join(root, "{repo}.{branch}"),
      repo: "demo",
      branch: "plan/my-feature",
    });
    expect(result).toEqual({ worktreePath: expectedPath, branch: "plan/my-feature" });
    expect(calls).toContainEqual([
      "git", "worktree", "add", expectedPath, "-b", "plan/my-feature", "main",
    ]);
  });

  it("writes the meta, seeds SESSION-NOTES, and writes the marker into the new worktree root", async () => {
    const { worktreePath } = await spawnWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      params(),
    );

    const metaPath = join(worktreePath, ".arc", "active", "meta-my-feature.md");
    const record = parseMetaRecord(await io.readFile(metaPath));
    expect(record.State).toBe("Planning");
    expect(record.Owner).toBe("andrew");
    expect(record.Branch).toBe("plan/my-feature");
    expect(record["Next Action"]).toBe("Begin planning");

    expect(
      await pathExists(join(worktreePath, ".arc", "user", "andrew", "my-feature", "SESSION-NOTES.md")),
    ).toBe(true);

    expect(await readWorktreeMarker(worktreePath)).toEqual({
      kind: "present",
      marker: {
        spawnedByArc: true,
        wuName: "my-feature",
        spawningIdentity: "andrew",
        createdAt: "2026-05-27T12:00:00.000Z",
      },
    });
  });

  it("leaves the originating session's working directory unchanged (no cd)", async () => {
    const before = process.cwd();
    await spawnWorktree({ io, internalTemplateDir: getInternalTemplatePath() }, params());
    expect(process.cwd()).toBe(before);
  });
});

function baseParams(root: string) {
  return {
    wuName: "my-feature",
    spawningIdentity: "andrew",
    baseBranch: "main",
    locationTemplate: join(root, "{repo}.{branch}"),
    repo: "demo",
    nextAction: "Begin planning",
    now: Date.parse("2026-05-27T12:00:00.000Z"),
  };
}

describe("spawnWorktree — life-phase routing", () => {
  let root: string;
  let calls: string[][];
  let io: UserIOContext;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-spawn-lifephase-"));
    const rec = recordingExec();
    calls = rec.calls;
    io = { ...createUserIOContext(), exec: rec.exec };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("routes a non-default life phase to the branch prefix and initial State", async () => {
    const { worktreePath, branch } = await spawnWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      { ...baseParams(root), lifePhase: { branchPrefix: "feat/", initialState: "Active" } },
    );

    expect(branch).toBe("feat/my-feature");
    expect(calls).toContainEqual([
      "git", "worktree", "add", worktreePath, "-b", "feat/my-feature", "main",
    ]);
    const record = parseMetaRecord(
      await io.readFile(join(worktreePath, ".arc", "active", "meta-my-feature.md")),
    );
    expect(record.State).toBe("Active");
    expect(record.Branch).toBe("feat/my-feature");
  });
});

describe("spawnWorktree — forward-compat tier/type", () => {
  let root: string;
  let io: UserIOContext;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-spawn-tiertype-"));
    io = { ...createUserIOContext(), exec: recordingExec().exec };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("accepts tier/type without branching on them", async () => {
    const result = await spawnWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      { ...baseParams(root), tier: "atomic", type: "feat" },
    );

    // tier/type leave the default Planning shaping intact.
    expect(result.branch).toBe("plan/my-feature");
    const record = parseMetaRecord(
      await io.readFile(join(result.worktreePath, ".arc", "active", "meta-my-feature.md")),
    );
    expect(record.State).toBe("Planning");
  });
});

describe("spawnWorktree — error and rollback", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-spawn-rollback-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("surfaces a `git worktree add` failure and scaffolds nothing", async () => {
    const failing: GitExec = async (_cmd, args) => {
      if (args[0] === "worktree" && args[1] === "add") {
        throw Object.assign(new Error("fatal: branch already exists"), { code: 128 });
      }
      return { stdout: "" };
    };
    const io = { ...createUserIOContext(), exec: failing };
    const params = baseParams(root);
    const expectedPath = resolveWorktreeLocation({
      template: params.locationTemplate, repo: params.repo, branch: "plan/my-feature",
    });

    await expect(
      spawnWorktree({ io, internalTemplateDir: getInternalTemplatePath() }, params),
    ).rejects.toThrow("branch already exists");
    expect(await pathExists(join(expectedPath, ".arc", "active", "meta-my-feature.md"))).toBe(false);
  });

  it("rolls back the worktree and branch when a post-add scaffold write fails", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (cmd, args) => {
      calls.push([cmd, ...args]);
      return { stdout: "" };
    };
    const io: UserIOContext = {
      ...createUserIOContext(),
      exec,
      writeFile: async () => {
        throw new Error("disk full");
      },
    };
    const params = baseParams(root);
    const expectedPath = resolveWorktreeLocation({
      template: params.locationTemplate, repo: params.repo, branch: "plan/my-feature",
    });

    await expect(
      spawnWorktree({ io, internalTemplateDir: getInternalTemplatePath() }, params),
    ).rejects.toThrow("disk full");
    expect(calls).toContainEqual(["git", "worktree", "remove", "--force", expectedPath]);
    expect(calls).toContainEqual(["git", "branch", "-D", "plan/my-feature"]);
  });
});
