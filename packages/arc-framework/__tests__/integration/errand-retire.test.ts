/**
 * Integration tests for `retireErrand` — the `arc errand retire` composed core —
 * over a real temp repo with a bare remote. Retire is the promotion counterpart
 * to `close`: it removes the identity record and pushes the removal, but never
 * touches the branch. When an errand crosses the work-unit threshold its branch
 * is renamed into the WU branch and lives on; only the record is retired (the WU
 * meta now supersedes it).
 *
 * Unlike `close`, there is no reap and so no containment-safety gate — retire is
 * always safe because the commits live on under the renamed branch.
 */

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
  retireErrand,
  readErrandRecord,
  errandsRef,
  type ErrandRecordIO,
} from "../../src/lib/errand/index.js";

const IDENTITY = "andrew";
const REF = errandsRef(IDENTITY);
const CREATED_AT = "2026-06-19T12:00:00.000Z";

function ioFor(dir: string): ErrandRecordIO {
  return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
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

describe("retireErrand", () => {
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

  it("removes the record and pushes the removal while the renamed branch survives", async () => {
    await openErrand(io, { slug: "growing", base: "main", type: "fix", createdAt: CREATED_AT });
    expect(await remoteSlugs(dir)).toEqual(["growing"]);
    // Promotion renames the errand branch into the WU branch before retiring the record.
    await git(dir, ["branch", "-m", "fix/growing", "feat/growing-feature"]);

    const result = await retireErrand(io, { slug: "growing" });

    expect(result.kind).toBe("retired");
    expect(await readErrandRecord(io, "growing")).toBeNull();
    expect(await remoteSlugs(dir)).toEqual([]);
    expect(await branchExists(dir, "feat/growing-feature")).toBe(true);
  });

  it("is a no-op when no record exists for the slug", async () => {
    expect(await retireErrand(io, { slug: "ghost" })).toEqual({
      kind: "no-record",
      slug: "ghost",
    });
  });
});
