/**
 * Integration tests for `promoteErrand` — the `arc errand promote` composed core —
 * over a real temp repo with a bare remote. Promotion is the crossing-out edge of
 * the errand lattice: an errand that crosses a wrapper floor is renamed into its
 * WU branch (commits preserved), gains a backing `meta-<name>.md` at the stage the
 * crossed floor dictates, and has its identity record retired.
 *
 * The behaviors are tightly coupled to one function (one branch rename + one meta
 * mint + one record retire), so they share a single fixture rather than slicing
 * per-behavior.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  addBareRemote,
  makeGitExec,
  makeGitExecInput,
  execFileAsync,
} from "../helpers/integration.js";
import {
  openErrand,
  promoteErrand,
  readErrandRecord,
  errandsRef,
  type ErrandRecordIO,
  type PromoteErrandContext,
} from "../../src/lib/errand/index.js";

const IDENTITY = "andrew";
const REF = errandsRef(IDENTITY);
const CREATED_AT = "2026-06-19T12:00:00.000Z";

function ioFor(dir: string): ErrandRecordIO {
  return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
}

function ctxFor(dir: string, io: ErrandRecordIO): PromoteErrandContext {
  return { io, fs: { mkdir, writeFile, readFile: (p) => readFile(p, "utf8") }, cwd: dir };
}

async function git(dir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: dir });
  return stdout;
}

async function branchExists(dir: string, branch: string): Promise<boolean> {
  try {
    await git(dir, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/** Slugs present on the remote errand ref. */
async function remoteSlugs(dir: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-remote", "origin", REF], { cwd: dir });
  if (stdout.trim() === "") return [];
  const { stdout: ls } = await execFileAsync(
    "git",
    ["ls-tree", "--name-only", `${stdout.trim().split(/\s+/u)[0]}^{tree}`],
    { cwd: dir },
  );
  return ls.split("\n").map((s) => s.trim()).filter(Boolean).sort();
}

async function readMeta(dir: string, name: string): Promise<string> {
  return readFile(join(dir, ".arc/active", `meta-${name}.md`), "utf8");
}

describe("promoteErrand", () => {
  let dir: string;
  let remoteDir: string;
  let io: ErrandRecordIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    await makeCommit(dir, "init");
    remoteDir = await addBareRemote(dir);
    io = ioFor(dir);
  });

  afterEach(async () => {
    await Promise.all([dir, remoteDir].map(cleanupTempDir));
  });

  it("derivation crossing → Planning meta at draft-design, branch renamed, record retired", async () => {
    await openErrand(io, { slug: "growing", base: "main", type: "fix", createdAt: CREATED_AT });
    // An errand commit, so the rename has work to preserve.
    await makeCommit(dir, "errand work");
    const head = (await git(dir, ["rev-parse", "HEAD"])).trim();

    const result = await promoteErrand(ctxFor(dir, io), {
      slug: "growing",
      name: "growth-feature",
      type: "feat",
      floor: "derivation",
      owner: IDENTITY,
    });

    expect(result.kind).toBe("promoted");
    // Branch renamed, commits preserved (HEAD unchanged), old name gone.
    expect(await branchExists(dir, "feat/growth-feature")).toBe(true);
    expect(await branchExists(dir, "fix/growing")).toBe(false);
    expect((await git(dir, ["rev-parse", "HEAD"])).trim()).toBe(head);
    // Record retired locally and on the remote.
    expect(await readErrandRecord(io, "growing")).toBeNull();
    expect(await remoteSlugs(dir)).toEqual([]);
    // Meta minted at the planning stage the derivation floor dictates.
    const meta = await readMeta(dir, "growth-feature");
    expect(meta).toContain("# Metadata: growth-feature");
    expect(meta).toMatch(/\bPlanning\b/u);
    expect(meta).toContain("feat/growth-feature");
    expect(meta).toContain("draft-design");
    expect(meta).toContain(IDENTITY);
  });

  it("scale crossing → Active meta (no draft-design), branch renamed, record retired", async () => {
    await openErrand(io, { slug: "sweeping", base: "main", type: "chore", createdAt: CREATED_AT });

    const result = await promoteErrand(ctxFor(dir, io), {
      slug: "sweeping",
      name: "sweep-unit",
      type: "refactor",
      floor: "scale",
      owner: IDENTITY,
    });

    expect(result.kind).toBe("promoted");
    expect(await branchExists(dir, "refactor/sweep-unit")).toBe(true);
    expect(await readErrandRecord(io, "sweeping")).toBeNull();
    const meta = await readMeta(dir, "sweep-unit");
    expect(meta).toMatch(/\bActive\b/u);
    expect(meta).not.toContain("draft-design");
  });

  it("is a no-op when no record exists for the slug", async () => {
    expect(await promoteErrand(ctxFor(dir, io), {
      slug: "ghost",
      name: "ghost-unit",
      type: "feat",
      floor: "scale",
      owner: IDENTITY,
    })).toEqual({ kind: "no-record", slug: "ghost" });
  });

  it("refuses with name-taken when a meta already backs the target name (no clobber, record intact)", async () => {
    await openErrand(io, { slug: "growing", base: "main", type: "fix", createdAt: CREATED_AT });
    await mkdir(join(dir, ".arc/active"), { recursive: true });
    await writeFile(join(dir, ".arc/active/meta-taken.md"), "# Metadata: taken\n");

    const result = await promoteErrand(ctxFor(dir, io), {
      slug: "growing",
      name: "taken",
      type: "feat",
      floor: "scale",
      owner: IDENTITY,
    });

    expect(result.kind).toBe("name-taken");
    // Record left intact and the errand branch unrenamed — promotion is recoverable.
    expect(await readErrandRecord(io, "growing")).not.toBeNull();
    expect(await branchExists(dir, "fix/growing")).toBe(true);
  });

  it("rejects a name with a path separator before any rename (no half-applied promotion)", async () => {
    await openErrand(io, { slug: "growing", base: "main", type: "fix", createdAt: CREATED_AT });

    await expect(
      promoteErrand(ctxFor(dir, io), {
        slug: "growing",
        name: "nested/name",
        type: "feat",
        floor: "scale",
        owner: IDENTITY,
      }),
    ).rejects.toThrow(/path separator/u);

    // The guard fires before the branch rename / meta write, so nothing is half-applied.
    expect(await branchExists(dir, "fix/growing")).toBe(true);
    expect(await readErrandRecord(io, "growing")).not.toBeNull();
  });
});
