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
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runColdStart, deriveColdStartWuName } from "../../../src/commands/start.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import { parseMetaRecord } from "../../../src/lib/active/meta-reader.js";
import { readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
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

function ctx(io: UserIOContext) {
  return { io, internalTemplateDir: getInternalTemplatePath() };
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
});
