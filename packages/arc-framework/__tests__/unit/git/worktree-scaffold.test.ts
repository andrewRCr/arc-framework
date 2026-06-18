/**
 * Unit tests for {@link scaffoldIntoWorktree} — the shared meta + SESSION-NOTES
 * writer for a work-unit worktree root. It never runs `git worktree add`: both
 * `start` entry paths (create-new after the `reconcile-worktree.spawn` leg, and
 * cold-start into an existing checkout) build on it. Covers the meta /
 * SESSION-NOTES scaffold, spec-input field rendering, and the `createdByArc`
 * marker gate. Git is mocked at the exec seam; the filesystem is real (temp dirs).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { scaffoldIntoWorktree } from "../../../src/lib/git/worktree-scaffold.js";
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

describe("scaffoldIntoWorktree — cold-start (use-existing)", () => {
  let worktree: string;
  let calls: string[][];
  let io: UserIOContext;

  beforeEach(async () => {
    // A worktree that already exists — created externally (tool / manual `git
    // worktree add`), entered by cold-start rather than minted by spawn.
    worktree = await mkdtemp(join(tmpdir(), "arc-coldstart-"));
    const rec = recordingExec();
    calls = rec.calls;
    io = { ...createUserIOContext(), exec: rec.exec };
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it("scaffolds a Planning meta and seeds SESSION-NOTES into an existing worktree without creating one", async () => {
    await scaffoldIntoWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      {
        worktreePath: worktree,
        branch: "feat/manual-tool",
        wuName: "manual-tool",
        spawningIdentity: "andrew",
        nextAction: "Begin planning",
        createdByArc: false,
        now: Date.parse("2026-05-27T12:00:00.000Z"),
      },
    );

    const record = parseMetaRecord(
      await io.readFile(join(worktree, ".arc", "active", "meta-manual-tool.md")),
    );
    expect(record.State).toBe("Planning");
    expect(record.Owner).toBe("andrew");
    expect(record.Branch).toBe("feat/manual-tool");
    expect(record["Next Action"]).toBe("Begin planning");
    // A Planning scaffold names the entry planning stage in Current Workflow.
    expect(record["Current Workflow"]).toBe("draft-design");

    expect(
      await pathExists(join(worktree, ".arc", "user", "andrew", "manual-tool", "SESSION-NOTES.md")),
    ).toBe(true);

    // Use-existing path: it scaffolds into the given root and never creates a worktree.
    expect(calls.some((c) => c[0] === "git" && c[1] === "worktree" && c[2] === "add")).toBe(false);
  });

  it("renders Origin and Design from parsed spec-input fields (Origin ⊥ Design)", async () => {
    await scaffoldIntoWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      {
        worktreePath: worktree,
        branch: "feat/manual-tool",
        wuName: "manual-tool",
        spawningIdentity: "andrew",
        origin: "https://github.com/acme/widget/issues/42",
        design: "spec-manual-tool.md",
        createdByArc: false,
      },
    );

    const record = parseMetaRecord(
      await io.readFile(join(worktree, ".arc", "active", "meta-manual-tool.md")),
    );
    expect(record.Origin).toBe("https://github.com/acme/widget/issues/42");
    expect(record.Design).toBe("spec-manual-tool.md");
  });
});

describe("scaffoldIntoWorktree — planning-stage pointer at init", () => {
  let worktree: string;
  let io: UserIOContext;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "arc-scaffold-stage-"));
    io = { ...createUserIOContext(), exec: recordingExec().exec };
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it("writes Current Workflow at the entry planning stage for a Planning scaffold", async () => {
    await scaffoldIntoWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      {
        worktreePath: worktree,
        branch: "plan/fresh-wu",
        wuName: "fresh-wu",
        spawningIdentity: "andrew",
        createdByArc: false,
      },
    );
    const record = parseMetaRecord(
      await io.readFile(join(worktree, ".arc", "active", "meta-fresh-wu.md")),
    );
    expect(record.State).toBe("Planning");
    expect(record["Current Workflow"]).toBe("draft-design");
  });

  it("seeds Next Action with no workflow pointer (the begin-current-workflow sentinel)", async () => {
    await scaffoldIntoWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      {
        worktreePath: worktree,
        branch: "plan/fresh-wu",
        wuName: "fresh-wu",
        spawningIdentity: "andrew",
        createdByArc: false,
      },
    );
    const record = parseMetaRecord(
      await io.readFile(join(worktree, ".arc", "active", "meta-fresh-wu.md")),
    );
    expect(record["Next Action"]).toBe("[begin current workflow]");
  });

  it("clears Current Workflow to [none] when scaffolding a non-Planning state", async () => {
    await scaffoldIntoWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      {
        worktreePath: worktree,
        branch: "feat/promoted",
        wuName: "promoted",
        spawningIdentity: "andrew",
        initialState: "Active",
        createdByArc: false,
      },
    );
    const record = parseMetaRecord(
      await io.readFile(join(worktree, ".arc", "active", "meta-promoted.md")),
    );
    expect(record.State).toBe("Active");
    expect(record["Current Workflow"]).toBe("[none]");
  });
});

describe("scaffoldIntoWorktree — ownership marker semantics (created-by-arc flag)", () => {
  let worktree: string;
  let io: UserIOContext;

  beforeEach(async () => {
    worktree = await mkdtemp(join(tmpdir(), "arc-coldstart-marker-"));
    io = { ...createUserIOContext(), exec: recordingExec().exec };
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  it("writes no marker on the advisory cold-start path (createdByArc: false)", async () => {
    await scaffoldIntoWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      {
        worktreePath: worktree,
        branch: "feat/manual-tool",
        wuName: "manual-tool",
        spawningIdentity: "andrew",
        createdByArc: false,
      },
    );

    // Absence is the "not ARC-created" signal — cleanup of a tool-made worktree stays advisory.
    expect(await readWorktreeMarker(worktree)).toEqual({ kind: "absent" });
  });

  it("writes the marker when ARC created the worktree (createdByArc: true)", async () => {
    await scaffoldIntoWorktree(
      { io, internalTemplateDir: getInternalTemplatePath() },
      {
        worktreePath: worktree,
        branch: "feat/manual-tool",
        wuName: "manual-tool",
        spawningIdentity: "andrew",
        createdByArc: true,
        now: Date.parse("2026-05-27T12:00:00.000Z"),
      },
    );

    expect(await readWorktreeMarker(worktree)).toEqual({
      kind: "present",
      marker: {
        spawnedByArc: true,
        wuName: "manual-tool",
        spawningIdentity: "andrew",
        createdAt: "2026-05-27T12:00:00.000Z",
      },
    });
  });
});
