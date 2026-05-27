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
  readWorktreeMarker,
  writeWorktreeMarker,
  writeWorktreeOwnershipMarker,
  resolveWorktreeMarkerPath,
  type WorktreeMarker,
} from "../../../src/lib/git/worktree-marker.js";

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
      wuName: "worktree-foundation",
      spawningIdentity: "andrew",
      now: Date.parse("2026-05-27T12:00:00.000Z"),
    });

    expect(await readWorktreeMarker(cwd)).toEqual({
      kind: "present",
      marker: {
        spawnedByArc: true,
        wuName: "worktree-foundation",
        spawningIdentity: "andrew",
        createdAt: "2026-05-27T12:00:00.000Z",
      },
    });
  });

  it("writes no marker for an advisory worktree ARC did not create", async () => {
    await writeWorktreeOwnershipMarker(cwd, {
      createdByArc: false,
      wuName: "worktree-foundation",
      spawningIdentity: "andrew",
    });

    expect(await readWorktreeMarker(cwd)).toEqual({ kind: "absent" });
  });
});
