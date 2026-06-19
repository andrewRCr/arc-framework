/**
 * Integration tests for the errand orphan state-ref primitives.
 *
 * Runs against a real temporary git repo to verify per-slug records write to
 * and read from `refs/arc/user/{identity}/errands` as a tree of blobs, that
 * removal is surgical, and that nothing is materialized into the working tree
 * (records-only).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";

import {
  createTempRepo,
  cleanupTempDir,
  makeCommit,
  makeGitExec,
  makeGitExecInput,
  fileExists,
} from "../helpers/integration.js";
import {
  readErrandRecord,
  writeErrandRecord,
  removeErrandRecord,
  listErrandRecords,
  errandsRef,
  type ErrandRecord,
  type ErrandRecordIO,
} from "../../src/lib/errand/index.js";

const IDENTITY = "andrew";

function recordFor(slug: string, overrides: Partial<ErrandRecord> = {}): ErrandRecord {
  return {
    version: 1,
    slug,
    origin: "description",
    intent: `do ${slug}`,
    branch: `chore/${slug}`,
    createdAt: "2026-06-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("errand orphan state-ref primitives", () => {
  let dir: string;
  let io: ErrandRecordIO;

  beforeEach(async () => {
    dir = await createTempRepo();
    // An orphan state-ref needs no commit history, but a HEAD keeps the repo
    // in a normal state for the records-only filesystem assertion.
    await makeCommit(dir, "init");
    io = { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("writes a record keyed by slug and reads it back by slug", async () => {
    const record = recordFor("drain-inbox", { origin: "inbox", originEntry: "drain-inbox" });
    await writeErrandRecord(io, record);

    expect(await readErrandRecord(io, "drain-inbox")).toEqual(record);
  });

  it("reads an absent slug back as null", async () => {
    await writeErrandRecord(io, recordFor("present"));

    expect(await readErrandRecord(io, "absent")).toBeNull();
  });

  it("reads null from an entirely absent ref", async () => {
    expect(await readErrandRecord(io, "anything")).toBeNull();
    expect(await listErrandRecords(io)).toEqual([]);
  });

  it("removes one slug's blob and leaves the rest of the tree intact", async () => {
    await writeErrandRecord(io, recordFor("keep-a"));
    await writeErrandRecord(io, recordFor("drop"));
    await writeErrandRecord(io, recordFor("keep-b"));

    await removeErrandRecord(io, "drop");

    expect(await readErrandRecord(io, "drop")).toBeNull();
    expect(await readErrandRecord(io, "keep-a")).toEqual(recordFor("keep-a"));
    expect(await readErrandRecord(io, "keep-b")).toEqual(recordFor("keep-b"));
  });

  it("removing an absent slug is a no-op that leaves existing records intact", async () => {
    await writeErrandRecord(io, recordFor("keep"));

    await removeErrandRecord(io, "never-there");

    expect(await readErrandRecord(io, "keep")).toEqual(recordFor("keep"));
  });

  it("lists every slug present in the tree", async () => {
    await writeErrandRecord(io, recordFor("alpha"));
    await writeErrandRecord(io, recordFor("beta"));
    await writeErrandRecord(io, recordFor("gamma"));

    const slugs = (await listErrandRecords(io)).map((r) => r.slug).sort();
    expect(slugs).toEqual(["alpha", "beta", "gamma"]);
  });

  it("replaces a record in place when the same slug is written again", async () => {
    await writeErrandRecord(io, recordFor("revise", { intent: "first" }));
    await writeErrandRecord(io, recordFor("revise", { intent: "second" }));

    expect((await readErrandRecord(io, "revise"))?.intent).toBe("second");
    expect(await listErrandRecords(io)).toHaveLength(1);
  });

  it("materializes nothing into the working tree (records-only)", async () => {
    await writeErrandRecord(io, recordFor("no-fs"));

    expect(await fileExists(join(dir, ".arc", "user", IDENTITY, "errands"))).toBe(false);
    // The records live only in the ref, never as tracked or untracked files.
    const { stdout } = await io.exec("git", ["status", "--porcelain"]);
    expect(stdout.trim()).toBe("");
  });

  it("stores records in the dedicated per-identity errand ref", async () => {
    await writeErrandRecord(io, recordFor("homed"));

    const { stdout } = await io.exec("git", ["rev-parse", "--verify", errandsRef(IDENTITY)]);
    expect(stdout.trim()).toMatch(/^[0-9a-f]{40}$/u);
  });
});
