/**
 * Integration tests for `openErrand` — the `arc errand open` composed core — over
 * a real temp repo with a bare remote. `open` mints the identity record, cuts a
 * nature-typed branch as its projection, pushes the record (Phase 2 sync), and
 * occupies the branch in place so the session never lingers on the launch branch.
 *
 * The four behaviors are exercised together because they share one function and
 * one repo-plus-remote setup; the seams the record primitives and the push were
 * unit/integration-covered on their own already.
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

async function currentBranch(dir: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir });
  return stdout.trim();
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

describe("openErrand", () => {
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

  it("mints a description record and pushes it to the remote ref", async () => {
    const result = await openErrand(io, { slug: "bump-deps", base: "main", createdAt: CREATED_AT });

    expect(result.push).toEqual({ kind: "pushed" });
    expect(await readErrandRecord(io, "bump-deps")).toEqual({
      version: 2,
      slug: "bump-deps",
      origin: "description",
      intent: "bump-deps",
      branch: "chore/bump-deps",
      createdAt: CREATED_AT,
      returnBranch: "main",
    });
    expect(await remoteSlugs(dir)).toEqual(["bump-deps"]);
  });

  it("cuts the branch nature-typed from the given type, defaulting to chore", async () => {
    const typed = await openErrand(io, { slug: "flaky-login", base: "main", type: "fix", createdAt: CREATED_AT });
    expect(typed.record.branch).toBe("fix/flaky-login");

    const defaulted = await openErrand(io, { slug: "tidy-readme", base: "main", createdAt: CREATED_AT });
    expect(defaulted.record.branch).toBe("chore/tidy-readme");
  });

  it("leaves an existing branch untouched (no-clobber) and still occupies it", async () => {
    await execFileAsync("git", ["branch", "fix/preexisting", "main"], { cwd: dir });
    const { stdout: before } = await execFileAsync("git", ["rev-parse", "fix/preexisting"], { cwd: dir });

    const result = await openErrand(io, { slug: "preexisting", base: "main", type: "fix", createdAt: CREATED_AT });

    expect(result.branchCreated).toBe(false);
    const { stdout: after } = await execFileAsync("git", ["rev-parse", "fix/preexisting"], { cwd: dir });
    expect(after.trim()).toBe(before.trim());
    expect(await currentBranch(dir)).toBe("fix/preexisting");
  });

  it("occupies the cut branch in place — never left on the launch branch", async () => {
    expect(await currentBranch(dir)).toBe("main");

    await openErrand(io, { slug: "occupy-me", base: "main", createdAt: CREATED_AT });

    expect(await currentBranch(dir)).toBe("chore/occupy-me");
  });

  it("produces a recoverable record for a bare free-description open, intent defaulting to the slug", async () => {
    await openErrand(io, { slug: "no-intent-given", base: "main", createdAt: CREATED_AT });

    const record = await readErrandRecord(io, "no-intent-given");
    expect(record?.origin).toBe("description");
    expect(record?.intent).toBe("no-intent-given");
    expect(record?.originEntry).toBeUndefined();
  });

  it("uses a supplied intent verbatim when given", async () => {
    await openErrand(io, {
      slug: "scoped",
      base: "main",
      intent: "drain the stale drain-inbox capture",
      createdAt: CREATED_AT,
    });

    expect((await readErrandRecord(io, "scoped"))?.intent).toBe("drain the stale drain-inbox capture");
  });

  it("mints an inbox-origin record carrying the back-pointer when an originating entry is given", async () => {
    await openErrand(io, {
      slug: "adopted",
      base: "main",
      originEntry: "stale-capture",
      createdAt: CREATED_AT,
    });

    const record = await readErrandRecord(io, "adopted");
    expect(record?.origin).toBe("inbox");
    expect(record?.originEntry).toBe("stale-capture");
  });
});
