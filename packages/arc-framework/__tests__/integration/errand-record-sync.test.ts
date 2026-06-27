/**
 * Integration tests for the errand-ref reconcile-push across two clones of a
 * shared remote — the real fetch / merge / retry path. A second clone stands in
 * for the other machine: it writes an errand without the first clone's ref, so
 * its push is a genuine non-fast-forward that the reconcile must resolve.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  writeErrandRecord,
  listErrandRecords,
  reconcileErrandPush,
  errandsRef,
  type ErrandRecord,
  type ErrandRecordIO,
} from "../../src/lib/errand/index.js";
import type { GitExec } from "../../src/lib/git/exec.js";

const IDENTITY = "andrew";
const REF = errandsRef(IDENTITY);

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

function ioFor(dir: string): ErrandRecordIO {
  return { exec: makeGitExec(dir), execInput: makeGitExecInput(dir), identity: IDENTITY };
}

async function cloneOf(remoteDir: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-errand-clone-"));
  await execFileAsync("git", ["clone", remoteDir, dir]);
  await execFileAsync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: dir });
  return dir;
}

/** Slugs present on the remote errand ref, read from a clone. */
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

describe("errand-ref reconcile-push", () => {
  let remoteDir: string;
  let repoA: string;
  let repoB: string;
  let ioA: ErrandRecordIO;
  let ioB: ErrandRecordIO;

  beforeEach(async () => {
    repoA = await createTempRepo();
    await makeCommit(repoA, "init");
    remoteDir = await addBareRemote(repoA);
    repoB = await cloneOf(remoteDir);
    ioA = ioFor(repoA);
    ioB = ioFor(repoB);
  });

  afterEach(async () => {
    await Promise.all([repoA, repoB, remoteDir].map(cleanupTempDir));
  });

  it("creates an absent remote ref on the first push (no merge needed)", async () => {
    await writeErrandRecord(ioA, recordFor("first"));

    expect(await reconcileErrandPush(ioA)).toEqual({ kind: "pushed" });
    expect(await remoteSlugs(repoA)).toEqual(["first"]);
  });

  it("is a no-op when there is no local ref to push", async () => {
    expect(await reconcileErrandPush(ioA)).toEqual({ kind: "noop" });
  });

  it("unions errands created on two clones over a non-fast-forward push", async () => {
    await writeErrandRecord(ioA, recordFor("from-a"));
    await reconcileErrandPush(ioA);

    // repoB never fetched the ref, so its write forks a divergent root.
    await writeErrandRecord(ioB, recordFor("from-b"));
    expect(await reconcileErrandPush(ioB)).toEqual({ kind: "reconciled" });

    expect(await remoteSlugs(repoB)).toEqual(["from-a", "from-b"]);
    expect((await listErrandRecords(ioB)).map((r) => r.slug).sort()).toEqual([
      "from-a",
      "from-b",
    ]);
  });

  it("merges a byte-identical same-slug errand without collision", async () => {
    // Each clone also carries a distinct errand, so the trees genuinely diverge
    // (forcing a real non-fast-forward) while `shared` is byte-identical on both.
    await writeErrandRecord(ioA, recordFor("a-side"));
    await writeErrandRecord(ioA, recordFor("shared"));
    await reconcileErrandPush(ioA);

    await writeErrandRecord(ioB, recordFor("b-side"));
    await writeErrandRecord(ioB, recordFor("shared"));
    expect(await reconcileErrandPush(ioB)).toEqual({ kind: "reconciled" });

    // `shared` survives once — unioned, not collided.
    expect(await remoteSlugs(repoB)).toEqual(["a-side", "b-side", "shared"]);
  });

  it("rejects a divergent same-slug errand as a collision and pushes nothing", async () => {
    await writeErrandRecord(ioA, recordFor("clash", { intent: "the A version" }));
    await reconcileErrandPush(ioA);

    await writeErrandRecord(ioB, recordFor("clash", { intent: "the B version" }));
    expect(await reconcileErrandPush(ioB)).toEqual({ kind: "conflict", slugs: ["clash"] });

    // Remote keeps A's version; B's local ref is left intact.
    expect(await remoteSlugs(repoB)).toEqual(["clash"]);
    expect((await listErrandRecords(ioB))[0]?.intent).toBe("the B version");
  });

  it("folds a CAS rejection in the reconcile local-commit leg into a failed outcome rather than throwing", async () => {
    await writeErrandRecord(ioA, recordFor("from-a"));
    await reconcileErrandPush(ioA);

    // repoB's divergent write makes its push a genuine non-fast-forward, entering
    // the reconcile path. Instrument so the reconcile's local-commit update-ref
    // hits a CAS rejection (a concurrent same-machine writer moved the ref); it
    // must surface through the outcome union, never escape as a raw rejection.
    await writeErrandRecord(ioB, recordFor("from-b"));

    const realExec = makeGitExec(repoB);
    const failingExec: GitExec = async (cmd, args) => {
      if (args[0] === "update-ref" && args[1] === REF) {
        throw new Error(`fatal: cannot lock ref '${REF}': is at aaa but expected bbb`);
      }
      return realExec(cmd, args);
    };
    const ioFail: ErrandRecordIO = {
      exec: failingExec,
      execInput: makeGitExecInput(repoB),
      identity: IDENTITY,
    };

    expect((await reconcileErrandPush(ioFail)).kind).toBe("failed");
  });
});
