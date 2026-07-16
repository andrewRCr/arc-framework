/**
 * Unit tests for the worktree-ownership marker lib.
 *
 * Covers the write/read round-trip of the machine-local marker that records
 * ARC created a worktree, the absent-marker tolerance (a missing file reads as
 * "no marker", not an error), and schema validation on read.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join, dirname } from "node:path";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  ensureWorktreeMarkerIgnored,
  decodeWorktreeHuskStamp,
  nodeWorktreeMarkerIgnoreFs,
  readWorktreeMarker,
  stampWorktreeHusk,
  writeWorktreeMarker,
  writeWorktreeOwnershipMarker,
  resolveWorktreeMarkerPath,
  type WorktreeMarker,
  type WorktreeHuskStamp,
  type WorktreeSubject,
} from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

describe("worktree-marker", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-marker-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const sampleMarker: WorktreeMarker = {
    spawnedByArc: true,
    wuName: "worktree-foundation",
    spawningIdentity: "andrew",
    createdAt: "2026-05-25T00:00:00.000Z",
  };

  it("writes a schema-valid marker that read round-trips", async () => {
    await writeWorktreeMarker(cwd, sampleMarker);

    // Lands at the documented machine-local location as pretty-printed JSON.
    const raw = await readFile(resolveWorktreeMarkerPath(cwd), "utf8");
    expect(JSON.parse(raw)).toEqual(sampleMarker);

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: sampleMarker });
  });

  it("tolerates an absent marker — a missing file reads as 'no marker', not an error", async () => {
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });
  });

  it("reports invalid marker JSON as malformed", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{ not json", "utf8");

    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });

  it("reports a marker that parses but fails the schema as malformed", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ spawnedByArc: "yes", wuName: 3 }), "utf8");

    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });

  it.each<WorktreeSubject>([
    { kind: "work-unit", name: "worktree-foundation" },
    { kind: "errand", slug: "refresh-fixtures" },
    { kind: "branch", ref: "chore/refresh-fixtures" },
  ])("round-trips neutral $kind ownership without deriving it from a branch", async (createdFor) => {
    const marker: WorktreeMarker = {
      spawnedByArc: true,
      createdFor,
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };

    await writeWorktreeMarker(cwd, marker);

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker });
  });

  it("accepts agreeing dual-written WU ownership and rejects conflicting or identity-free markers", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    const base = {
      spawnedByArc: true,
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    };
    const agreeing: WorktreeMarker = {
      ...base,
      wuName: "worktree-foundation",
      createdFor: { kind: "work-unit", name: "worktree-foundation" },
    };

    await writeFile(path, JSON.stringify(agreeing), "utf8");
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker: agreeing });

    await writeFile(
      path,
      JSON.stringify({
        ...base,
        wuName: "worktree-foundation",
        createdFor: { kind: "work-unit", name: "another-work-unit" },
      }),
      "utf8",
    );
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");

    await writeFile(path, JSON.stringify(base), "utf8");
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });

  it("round-trips a complete husk stamp without changing its terminal identity or projection", async () => {
    const husk: WorktreeHuskStamp = {
      sha: "0123456789abcdef0123456789abcdef01234567",
      at: "2026-07-14T20:00:00.000Z",
      subject: { kind: "work-unit", name: "worktree-foundation" },
      branch: "feat/worktree-foundation",
    };
    const marker: WorktreeMarker = { ...sampleMarker, husk };

    await writeWorktreeMarker(cwd, marker);

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "present", marker });
  });

  it("rejects partial husk stamps and recordless subjects that disagree with the stamped branch", async () => {
    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });

    await writeFile(path, JSON.stringify({ ...sampleMarker, husk: { sha: "abc" } }), "utf8");
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");

    await writeFile(
      path,
      JSON.stringify({
        ...sampleMarker,
        husk: {
          sha: "0123456789abcdef0123456789abcdef01234567",
          at: "2026-07-14T20:00:00.000Z",
          subject: { kind: "branch", ref: "chore/one" },
          branch: "chore/two",
        },
      }),
      "utf8",
    );
    expect((await readWorktreeMarker(cwd)).kind).toBe("malformed");
  });
});

describe("decodeWorktreeHuskStamp", () => {
  const base: WorktreeHuskStamp = {
    sha: "0123456789abcdef0123456789abcdef01234567",
    at: "2026-07-14T20:00:00.000Z",
    subject: { kind: "work-unit", name: "demo" },
    branch: "feat/demo",
  };

  it("decodes the all-absent legacy shape without remote-delete authority", () => {
    expect(decodeWorktreeHuskStamp(base)).toEqual({ kind: "legacy", authorization: "merged-preserved" });
  });

  it("decodes an all-present current stamp", () => {
    const stamp: WorktreeHuskStamp = {
      ...base,
      authorization: "discard-confirmed",
      remoteRef: { remote: "origin", oid: base.sha, disposition: "delete" },
      evidence: {
        kind: "receipt",
        receiptId: `sha256:${"1".repeat(64)}`,
        transition: "abandon",
        expectedLifecycle: "nonexistent",
        resultDigest: `sha256:${"2".repeat(64)}`,
      },
    };

    expect(decodeWorktreeHuskStamp(stamp)).toMatchObject({
      kind: "current",
      authorization: "discard-confirmed",
    });
  });

  it("makes mixed and unknown future shapes manual-only", () => {
    expect(decodeWorktreeHuskStamp({ ...base, authorization: "merged-preserved" })).toEqual({
      kind: "manual-only",
      reason: "mixed-presence",
    });
    expect(decodeWorktreeHuskStamp({
      ...base,
      authorization: "future-proof",
      remoteRef: null,
      evidence: { kind: "future-evidence", version: 2 },
    })).toEqual({ kind: "manual-only", reason: "unknown-authorization" });
  });
});

describe("writeWorktreeOwnershipMarker — created-by-arc flag gates the write", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-ownership-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("writes a spawnedByArc marker with the injected timestamp when ARC created the worktree", async () => {
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "worktree-foundation" },
      spawningIdentity: "andrew",
      now: Date.parse("2026-05-27T12:00:00.000Z"),
    });

    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: {
        spawnedByArc: true,
        wuName: "worktree-foundation",
        createdFor: { kind: "work-unit", name: "worktree-foundation" },
        spawningIdentity: "andrew",
        createdAt: "2026-05-27T12:00:00.000Z",
      },
    });
  });

  it("writes no marker for an advisory worktree ARC did not create", async () => {
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: false,
      createdFor: { kind: "work-unit", name: "worktree-foundation" },
      spawningIdentity: "andrew",
    });

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });
  });

  it("writes neutral non-WU ownership without fabricating a legacy WU name", async () => {
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: true,
      createdFor: { kind: "errand", slug: "refresh-fixtures" },
      spawningIdentity: "andrew",
      now: Date.parse("2026-05-27T12:00:00.000Z"),
    });

    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: {
        spawnedByArc: true,
        createdFor: { kind: "errand", slug: "refresh-fixtures" },
        spawningIdentity: "andrew",
        createdAt: "2026-05-27T12:00:00.000Z",
      },
    });
  });
});

describe("stampWorktreeHusk", () => {
  let cwd: string;
  const husk: WorktreeHuskStamp = {
    sha: "0123456789abcdef0123456789abcdef01234567",
    at: "2026-07-14T20:00:00.000Z",
    subject: { kind: "work-unit", name: "worktree-foundation" },
    branch: "feat/worktree-foundation",
  };

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-husk-stamp-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it.each<WorktreeMarker>([
    {
      spawnedByArc: true,
      wuName: "worktree-foundation",
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    },
    {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "refresh-fixtures" },
      spawningIdentity: "andrew",
      createdAt: "2026-05-25T00:00:00.000Z",
    },
  ])("extends valid ownership without changing its creation fields", async (marker) => {
    await writeWorktreeMarker(cwd, marker);

    expect(await stampWorktreeHusk(cwd, husk)).toEqual({
      kind: "stamped",
      marker: { ...marker, husk },
    });
    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: { ...marker, husk },
    });
  });

  it("does not mint or repair ownership when the marker is absent or malformed", async () => {
    expect(await stampWorktreeHusk(cwd, husk)).toEqual({ kind: "absent" });
    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });

    const path = resolveWorktreeMarkerPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{ not json", "utf8");

    expect((await stampWorktreeHusk(cwd, husk)).kind).toBe("malformed");
    expect(await readFile(path, "utf8")).toBe("{ not json");
  });
});

describe("ensureWorktreeMarkerIgnored", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-worktree-marker-ignore-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  function execReturningGitExclude(): { exec: GitExec; calls: string[][] } {
    const calls: string[][] = [];
    const exec: GitExec = async (cmd, args, options) => {
      calls.push([cmd, ...args, options?.cwd ?? ""]);
      return { stdout: ".git/info/exclude\n" };
    };
    return { exec, calls };
  }

  it("appends the marker pattern to the worktree's git exclude file", async () => {
    const { exec, calls } = execReturningGitExclude();
    const excludePath = join(cwd, ".git", "info", "exclude");
    await mkdir(dirname(excludePath), { recursive: true });
    await writeFile(excludePath, "# local ignores\n", "utf8");

    await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);

    await expect(readFile(excludePath, "utf8")).resolves.toBe(
      "# local ignores\n.arc/system/.internal/worktree-marker.json\n",
    );
    expect(calls).toEqual([["git", "rev-parse", "--git-path", "info/exclude", cwd]]);
  });

  it("does not duplicate an existing marker pattern", async () => {
    const { exec } = execReturningGitExclude();
    const excludePath = join(cwd, ".git", "info", "exclude");
    const existing = ".arc/system/.internal/worktree-marker.json\n";
    await mkdir(dirname(excludePath), { recursive: true });
    await writeFile(excludePath, existing, "utf8");

    await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);

    await expect(readFile(excludePath, "utf8")).resolves.toBe(existing);
  });
});
