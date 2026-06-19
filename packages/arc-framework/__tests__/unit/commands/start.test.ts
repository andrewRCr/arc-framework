/**
 * Unit tests for the cold-start orchestrator behind `arc start --here` — the
 * use-existing path that scaffolds a Planning meta into a worktree ARC did not
 * create. Wraps the already-tested `scaffoldIntoWorktree` primitive; these
 * cover the command-level concerns: WU-name derivation, the spec-input
 * classification (`--from`), the advisory-marker path, and the guard that
 * refuses to clobber a worktree that already holds an active work unit.
 *
 * Git is mocked at the exec seam; the filesystem is real (temp dirs), matching
 * the sibling worktree-scaffold tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";

import { runColdStart, runCreateNew, deriveColdStartWuName } from "../../../src/commands/start.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { resolveWorktreeLocation } from "../../../src/lib/git/worktree-location.js";
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

/**
 * A recording mock exec that additionally answers `git worktree list
 * --porcelain` with a one-stanza listing whose path is `primaryPath` — the
 * primary worktree create-new derives `{repo}` from. Every other call succeeds.
 */
function recordingExecWithPrimary(primaryPath: string): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: GitExec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[0] === "worktree" && args[1] === "list") {
      return { stdout: `worktree ${primaryPath}\nHEAD abc123\nbranch refs/heads/main\n` };
    }
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

function ctx(io: UserIOContext) {
  return { io, internalTemplateDir: getInternalTemplatePath() };
}

/** Write a minimal `arc-config.yml` (flat dotted keys) into a worktree's `.arc/system/`. */
async function writeArcConfig(worktree: string, values: Record<string, string>): Promise<void> {
  const systemDir = join(worktree, ".arc", "system");
  await mkdir(systemDir, { recursive: true });
  const body = Object.entries(values).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n";
  await writeFile(join(systemDir, "arc-config.yml"), body);
}

describe("deriveColdStartWuName", () => {
  it("strips a conventional branch prefix (feat/foo → foo)", () => {
    expect(deriveColdStartWuName(undefined, "feat/widget")).toBe("widget");
    expect(deriveColdStartWuName(undefined, "plan/widget")).toBe("widget");
  });

  it("uses a prefixless branch verbatim", () => {
    expect(deriveColdStartWuName(undefined, "widget")).toBe("widget");
  });

  it("prefers an explicit name over the branch", () => {
    expect(deriveColdStartWuName("custom", "feat/widget")).toBe("custom");
  });

  it("refuses a name that is empty or not filename-safe", () => {
    expect(deriveColdStartWuName(undefined, "feat/")).toBeNull();
    expect(deriveColdStartWuName(undefined, "team/sub/widget")).toBeNull();
    expect(deriveColdStartWuName("  ", "feat/widget")).toBeNull();
  });
});

describe("runColdStart — use-existing scaffolding", () => {
  let worktree: string;
  let calls: string[][];
  let io: UserIOContext;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "arc-coldstart-cmd-"));
    const rec = recordingExec();
    calls = rec.calls;
    io = { ...createUserIOContext(), exec: rec.exec };
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it("scaffolds a Planning meta and SESSION-NOTES into the current worktree, creating none", async () => {
    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.wuName).toBe("widget");

    const record = parseMetaRecord(
      await io.readFile(join(worktree, ".arc", "active", "meta-widget.md")),
    );
    expect(record.State).toBe("Planning");
    expect(record.Owner).toBe("andrew");
    expect(record.Branch).toBe("feat/widget");

    expect(
      await pathExists(join(worktree, ".arc", "user", "andrew", "widget", "SESSION-NOTES.md")),
    ).toBe(true);

    // Use-existing: never creates a worktree.
    expect(calls.some((c) => c[0] === "git" && c[1] === "worktree" && c[2] === "add")).toBe(false);
  });

  it("uses an explicit name over the branch-derived default", async () => {
    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
      name: "custom-name",
    });

    expect(outcome.ok).toBe(true);
    expect(await pathExists(join(worktree, ".arc", "active", "meta-custom-name.md"))).toBe(true);
  });

  it("writes no ownership marker — cold-start is advisory (createdByArc: false)", async () => {
    await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
    });

    expect(await readWorktreeMarker(worktree)).toEqual({ kind: "absent" });
  });

  it("returns a refusal (no throw) when scaffolding fails", async () => {
    // Force the scaffold write to reject — runColdStart must convert it to a
    // refusal rather than throw (symmetric with runCreateNew's spawn guard).
    const failIo: UserIOContext = {
      ...io,
      writeFile: async () => {
        throw new Error("EACCES: permission denied");
      },
    };

    const outcome = await runColdStart(ctx(failIo), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/could not scaffold the work unit/i);
    expect(outcome.reason).toMatch(/permission denied/);
  });
});

describe("runColdStart — protected-base auto-cut (candidate J)", () => {
  let worktree: string;
  let calls: string[][];
  let io: UserIOContext;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "arc-coldstart-protected-"));
    const rec = recordingExec();
    calls = rec.calls;
    io = { ...createUserIOContext(), exec: rec.exec };
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it("cuts plan/<name> off a protected base and scaffolds onto it, not refusing", async () => {
    await writeArcConfig(worktree, { "branch.protection": "full", "branch.base": "main" });

    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "main",
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.branch).toBe("plan/widget");
    expect(outcome.value.cutFromBase).toBe("main");
    // The branch was cut in place off the protected base.
    expect(calls).toContainEqual(["git", "switch", "-c", "plan/widget"]);
    // The scaffolded meta records the new plan branch, not the protected base.
    const record = parseMetaRecord(await io.readFile(join(worktree, ".arc", "active", "meta-widget.md")));
    expect(record.Branch).toBe("plan/widget");
  });

  it("leaves a feature branch under full protection unchanged (no cut)", async () => {
    await writeArcConfig(worktree, { "branch.protection": "full", "branch.base": "main" });

    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.branch).toBe("feat/widget");
    expect(outcome.value.cutFromBase).toBeUndefined();
    expect(calls.some((c) => c[1] === "switch" && c[2] === "-c")).toBe(false);
  });

  it("rolls the auto-cut back when scaffolding fails, leaving no dangling plan branch", async () => {
    await writeArcConfig(worktree, { "branch.protection": "full", "branch.base": "main" });
    const failIo: UserIOContext = { ...io, writeFile: async () => { throw new Error("EACCES: denied"); } };

    const outcome = await runColdStart(ctx(failIo), {
      worktreePath: worktree,
      branch: "main",
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/could not scaffold/i);
    // Rollback: switch back to the base and delete the half-cut branch.
    expect(calls).toContainEqual(["git", "switch", "main"]);
    expect(calls).toContainEqual(["git", "branch", "-D", "plan/widget"]);
  });

  it("removes the orphaned meta when scaffolding fails after the meta is written", async () => {
    await writeArcConfig(worktree, { "branch.protection": "full", "branch.base": "main" });
    // The meta write lands (call 1); the SESSION-NOTES seed write (call 2) throws —
    // so a partial scaffold leaves an orphan `.arc/active/meta-widget.md` behind.
    const realWrite = io.writeFile;
    let writes = 0;
    const failAfterMeta: UserIOContext = {
      ...io,
      writeFile: async (path, data) => {
        writes += 1;
        if (writes === 1) return realWrite(path, data);
        throw new Error("EACCES: denied");
      },
    };

    const outcome = await runColdStart(ctx(failAfterMeta), {
      worktreePath: worktree,
      branch: "main",
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // git switch leaves untracked files, so the rollback scrubs the orphaned meta
    // with a scoped pathspec — the next `arc start` won't see a phantom active WU.
    expect(calls).toContainEqual(["git", "clean", "-f", "--", ".arc/active/meta-widget.md"]);
  });
});

describe("runColdStart — spec-input classification (--from)", () => {
  let worktree: string;
  let io: UserIOContext;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "arc-coldstart-from-"));
    io = { ...createUserIOContext(), exec: recordingExec().exec };
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it("routes an issue reference to Origin", async () => {
    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
      from: "#42",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.origin).toBe("#42");
    expect(outcome.value.design).toBeUndefined();

    const record = parseMetaRecord(
      await io.readFile(join(worktree, ".arc", "active", "meta-widget.md")),
    );
    expect(record.Origin).toBe("#42");
  });

  it("routes an ARC spec artifact to Design", async () => {
    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
      from: "spec-widget.md",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.design).toBe("spec-widget.md");
    expect(outcome.value.origin).toBeUndefined();
  });

  it("passes a plain document through without setting Origin or Design", async () => {
    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
      from: "./design-notes.md",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.origin).toBeUndefined();
    expect(outcome.value.design).toBeUndefined();
    expect(outcome.value.passthrough).toEqual({ kind: "document", value: "./design-notes.md" });
  });

  it("passes a free-text blurb through as a description", async () => {
    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
      from: "build the OAuth login flow",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.passthrough).toEqual({
      kind: "description",
      value: "build the OAuth login flow",
    });
  });
});

describe("runColdStart — guards", () => {
  let worktree: string;
  let calls: string[][];
  let io: UserIOContext;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "arc-coldstart-guard-"));
    const rec = recordingExec();
    calls = rec.calls;
    io = { ...createUserIOContext(), exec: rec.exec };
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it("refuses to scaffold when the worktree already holds an active work unit", async () => {
    const activeDir = join(worktree, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-existing.md"),
      renderMetaFile("existing", { State: "Active", Owner: "andrew", Branch: "feat/existing" }),
    );

    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "feat/widget",
      identity: "andrew",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/already.*active work unit/i);
    // Nothing scaffolded for the would-be new WU.
    expect(await pathExists(join(activeDir, "meta-widget.md"))).toBe(false);
  });

  it("refuses when no clean WU name can be derived and none is given", async () => {
    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "team/sub/widget",
      identity: "andrew",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/name/i);
    expect(calls.some((c) => c[0] === "git" && c[1] === "worktree" && c[2] === "add")).toBe(false);
  });

  // The protected base no longer bare-refuses — it auto-cuts `plan/<name>` (see
  // "runColdStart — protected-base auto-cut (candidate J)" below).

  it("allows cold-start on the base branch under partial protection", async () => {
    await writeArcConfig(worktree, { "branch.protection": "partial", "branch.base": "main" });

    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "main",
      identity: "andrew",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.wuName).toBe("main");
    expect(await pathExists(join(worktree, ".arc", "active", "meta-main.md"))).toBe(true);
  });

  it("allows a feature branch under full protection", async () => {
    await writeArcConfig(worktree, { "branch.protection": "full", "branch.base": "main" });

    const outcome = await runColdStart(ctx(io), {
      worktreePath: worktree,
      branch: "plan/foo",
      identity: "andrew",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.wuName).toBe("foo");
    expect(await pathExists(join(worktree, ".arc", "active", "meta-foo.md"))).toBe(true);
  });
});

describe("runCreateNew — create-new worktree spawn", () => {
  let primaryRoot: string;

  beforeEach(async () => {
    // The primary worktree the command runs in (config source + `{repo}` source).
    // Its basename is the `{repo}` expansion; spawned worktrees resolve as
    // siblings under the same parent so the temp tree contains them.
    primaryRoot = await mkdtemp(join(tmpdir(), "arc-createnew-myrepo-"));
  });

  afterEach(async () => {
    await rm(primaryRoot, { recursive: true, force: true });
  });

  /** Template that lands the spawned worktree beside the primary (inside the temp parent). */
  function siblingTemplate(): string {
    return join(primaryRoot, "..", "{repo}.{branch}");
  }

  it("spawns a worktree on a new `plan/<name>` branch via the reconcile-worktree spawn leg", async () => {
    await writeArcConfig(primaryRoot, { "worktree.location_template": siblingTemplate() });
    const rec = recordingExecWithPrimary(primaryRoot);
    const io: UserIOContext = { ...createUserIOContext(), exec: rec.exec };

    const outcome = await runCreateNew(ctx(io), {
      worktreePath: primaryRoot,
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.branch).toBe("plan/widget");

    const expectedPath = resolveWorktreeLocation({
      template: siblingTemplate(),
      repo: basename(primaryRoot),
      branch: "plan/widget",
    });
    // The branch forks from the base via `git worktree add … -b plan/widget <base>`.
    expect(rec.calls).toContainEqual([
      "git", "worktree", "add", expectedPath, "-b", "plan/widget", "main",
    ]);
    // Spawn ran to completion: meta scaffolded + ownership marker written (ARC-created).
    const record = parseMetaRecord(
      await io.readFile(join(expectedPath, ".arc", "active", "meta-widget.md")),
    );
    expect(record.State).toBe("Planning");
    expect(record.Branch).toBe("plan/widget");
    expect((await readWorktreeMarker(expectedPath)).kind).toBe("present");

    await rm(expectedPath, { recursive: true, force: true });
  });

  it("resolves baseBranch / locationTemplate / repo from config, not hard-coded values", async () => {
    await writeArcConfig(primaryRoot, {
      "branch.base": "develop",
      "worktree.location_template": siblingTemplate(),
    });
    const rec = recordingExecWithPrimary(primaryRoot);
    const io: UserIOContext = { ...createUserIOContext(), exec: rec.exec };

    const outcome = await runCreateNew(ctx(io), {
      worktreePath: primaryRoot,
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const expectedPath = resolveWorktreeLocation({
      template: siblingTemplate(),
      repo: basename(primaryRoot),
      branch: "plan/widget",
    });
    // base from config (`develop`, not the `main` default); path from the
    // configured template expanded against the primary's basename (`{repo}`).
    expect(rec.calls).toContainEqual([
      "git", "worktree", "add", expectedPath, "-b", "plan/widget", "develop",
    ]);
    expect(outcome.value.worktreePath).toBe(expectedPath);

    await rm(expectedPath, { recursive: true, force: true });
  });

  it("refuses with a reason when no work-unit name is supplied", async () => {
    const rec = recordingExecWithPrimary(primaryRoot);
    const io: UserIOContext = { ...createUserIOContext(), exec: rec.exec };

    const outcome = await runCreateNew(ctx(io), {
      worktreePath: primaryRoot,
      identity: "andrew",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/name/i);
    // Refusal is total — no worktree created.
    expect(rec.calls.some((c) => c[1] === "worktree" && c[2] === "add")).toBe(false);
  });

  it("surfaces the resolved worktree path + branch on success", async () => {
    await writeArcConfig(primaryRoot, { "worktree.location_template": siblingTemplate() });
    const rec = recordingExecWithPrimary(primaryRoot);
    const io: UserIOContext = { ...createUserIOContext(), exec: rec.exec };

    const outcome = await runCreateNew(ctx(io), {
      worktreePath: primaryRoot,
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const expectedPath = resolveWorktreeLocation({
      template: siblingTemplate(),
      repo: basename(primaryRoot),
      branch: "plan/widget",
    });
    expect(outcome.value).toEqual({
      worktreePath: expectedPath,
      branch: "plan/widget",
      wuName: "widget",
    });

    await rm(expectedPath, { recursive: true, force: true });
  });

  it("refuses when the primary worktree path can't be resolved (no `{repo}` source)", async () => {
    // Empty `worktree list` output → no primary path → defensive refusal.
    const rec = recordingExec();
    const io: UserIOContext = { ...createUserIOContext(), exec: rec.exec };

    const outcome = await runCreateNew(ctx(io), {
      worktreePath: primaryRoot,
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(rec.calls.some((c) => c[1] === "worktree" && c[2] === "add")).toBe(false);
  });

  it("returns a refusal (no throw) when the worktree spawn fails", async () => {
    await writeArcConfig(primaryRoot, { "worktree.location_template": siblingTemplate() });
    // The primary-path probe answers, but `git worktree add` rejects (e.g. the
    // branch already exists). The spawn leg propagates — runCreateNew must
    // convert it to a refusal rather than throw, honoring the no-throw contract.
    const exec: GitExec = async (cmd, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return { stdout: `worktree ${primaryRoot}\nHEAD abc123\nbranch refs/heads/main\n` };
      }
      if (args[0] === "worktree" && args[1] === "add") {
        throw new Error("fatal: a branch named 'plan/widget' already exists");
      }
      return { stdout: "" };
    };
    const io: UserIOContext = { ...createUserIOContext(), exec };

    const outcome = await runCreateNew(ctx(io), {
      worktreePath: primaryRoot,
      identity: "andrew",
      name: "widget",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toMatch(/could not spawn the worktree/i);
    expect(outcome.reason).toMatch(/already exists/);
  });
});
