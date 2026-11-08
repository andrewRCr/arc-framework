/** Writes from a build that predates the storage cutover refuse once the repository's store has been imported. */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createStore } from "../../src/lib/store/create.js";
import { storeImported, StoreImportedError, storeImportedRefusal } from "../../src/lib/store/store-imported.js";
import { runUserRenameWorkspace, runUserSave } from "../../src/commands/user/save-load.js";
import { runUserFetch, runUserPull, runUserPush } from "../../src/commands/user/push-fetch.js";
import { runUserCompact } from "../../src/commands/user/compact.js";
import { transactTransientIdentities } from "../../src/lib/errand/identity-transaction.js";
import { reconcileErrandPush } from "../../src/lib/errand/merge.js";
import { TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
import { errandsRef } from "../../src/lib/errand/ref-tree.js";
import { cleanupTempDir, DEFAULT_PROMPTS, makeCommit, makeGitExec, makeGitExecInput, makeUserIO } from "../helpers/integration.js";
import { initInTempRepo } from "../helpers/init-temp-repo.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";

const execFileAsync = promisify(execFile);
const REGISTRY = "refs/arc/project/registry";
const IDENTITY = "test-user";
const provenance = { verb: "test", lifecycleAction: "update" };
let root: string;
const cleanup: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}
/** Run a check with the registry ref present, the way an import leaves the repository, then remove it. */
async function whileImported(check: () => Promise<void>, gitDir?: string): Promise<void> {
  const target = gitDir === undefined ? [] : [`--git-dir=${gitDir}`];
  await git(root, ...target, "update-ref", REGISTRY, await git(root, "rev-parse", "HEAD"));
  try { await check(); } finally { await git(root, ...target, "update-ref", "-d", REGISTRY); }
}

beforeAll(async () => {
  root = await initInTempRepo(DEFAULT_PROMPTS, IDENTITY);
  cleanup.push(root);
  await makeCommit(root, "initial commit");
  await mkdir(join(root, ".arc", "user", IDENTITY), { recursive: true });
  await writeFile(join(root, ".arc", "user", IDENTITY, "WORKING-MEMORY.md"), "# Working Memory\n", "utf8");
});
afterAll(async () => { await Promise.all(cleanup.map((dir) => cleanupTempDir(dir))); });

describe("imported store detection", () => {
  it("seals every checkout of the repository once the registry ref exists, and only then", async () => {
    const linked = `${root}-linked`;
    cleanup.push(linked);
    await git(root, "worktree", "add", "--detach", linked);
    expect(await storeImported(root)).toBe(false);
    await whileImported(async () => {
      expect(await storeImported(root)).toBe(true);
      expect(await storeImported(linked)).toBe(true);
    });
    expect(await storeImported(linked)).toBe(false);
  });

  it("reads the shared store repository's refs once one is installed", async () => {
    const store = join(root, ".git", "arc", "store");
    await git(root, "init", "--bare", "--quiet", store);
    await git(root, "-c", "core.hooksPath=/dev/null", "push", "--quiet", store, "HEAD:refs/heads/seed");
    try {
      await whileImported(async () => { expect(await storeImported(root)).toBe(false); });
      await whileImported(async () => { expect(await storeImported(root)).toBe(true); }, store);
    } finally {
      await cleanupTempDir(store);
    }
  });
});

describe("sealed writes", () => {
  it("refuses the interim backend's writes and synchronization while its reads stay open", async () => {
    const store = createStore(testStorePorts(root, makeGitExec(root), makeGitExecInput(root)));
    const reference = createReferenceFixture().reference("work-item/meta");
    const write = { action: "put" as const, reference, expected: null, content: "sealed", provenance };
    await whileImported(async () => {
      const refusal = { status: "refused", refusal: storeImportedRefusal() };
      expect(await store.write(write)).toEqual(refusal);
      expect(await store.batch({ writes: [write], provenance })).toEqual(refusal);
      expect(await store.push()).toEqual(refusal);
      expect(await store.pull()).toEqual(refusal);
      expect(await store.list({ family: "personal" })).toMatchObject({ status: "ok" });
    });
  });

  it("refuses a notes save without writing a note, and saves once the store is not imported", async () => {
    const io = makeUserIO(root);
    await whileImported(async () => {
      await expect(runUserSave({ cwd: root, io, identity: IDENTITY })).rejects.toBeInstanceOf(StoreImportedError);
      expect(await git(root, "for-each-ref", "refs/notes/")).toBe("");
    });
    expect((await runUserSave({ cwd: root, io, identity: IDENTITY })).fileCount).toBeGreaterThan(0);
  });

  it("refuses every other notes writer, running no Git beyond the import lookup", async () => {
    const real = makeGitExec(root);
    const exec = vi.fn<GitExec>((command, args, execOptions) => real(command, args, execOptions));
    const io = { ...makeUserIO(root), exec };
    const options = { cwd: root, io, identity: IDENTITY };
    const writers = [
      () => runUserRenameWorkspace({ ...options, oldWuName: "alpha", newWuName: "beta" }),
      () => runUserPush(options), () => runUserFetch(options), () => runUserPull(options), () => runUserCompact(options),
    ];
    await whileImported(async () => {
      for (const write of writers) await expect(write()).rejects.toBeInstanceOf(StoreImportedError);
    });
    expect(exec).toHaveBeenCalledTimes(writers.length);
    for (const [, args] of exec.mock.calls) expect(args).toEqual(expect.arrayContaining(["rev-parse", "--verify", REGISTRY]));
  });

  it("refuses a notes push given no checkout path by its executor's repository, not the process's", async () => {
    expect(process.cwd()).not.toBe(root);
    const origin = `${root}-origin`;
    cleanup.push(origin);
    await git(root, "init", "--bare", "--quiet", origin);
    await git(root, "remote", "add", "origin", origin);
    await git(root, "-c", "core.hooksPath=/dev/null", "push", "--quiet", "origin", "HEAD:refs/heads/main");
    const push = () => runUserPush({ io: makeUserIO(root), identity: IDENTITY });
    try {
      await whileImported(async () => { await expect(push()).rejects.toBeInstanceOf(StoreImportedError); });
      expect(await push()).toMatchObject({ kind: "pushed" });
    } finally {
      await git(root, "remote", "remove", "origin");
    }
  });

  it("refuses to mint or publish an Errand identity, and mints one once the store is not imported", async () => {
    const io = { exec: makeGitExec(root), execInput: makeGitExecInput(root), identity: IDENTITY };
    const timestamp = "2026-11-05T00:00:00.000Z";
    const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", slug: "alpha", claimId: "aa".repeat(16),
      purpose: "errand", origin: "description", originEntry: null, intent: "alpha", branch: "chore/alpha", state: "open",
      savedHead: null, changeRequest: null, createdAt: timestamp, updatedAt: timestamp });
    const mint = () => transactTransientIdentities(io, { remote: null, message: "open alpha",
      transform: () => ({ kind: "applied", records: new Map([["alpha", record]]), value: "alpha" }) });
    const sealed = new StoreImportedError().message;
    await whileImported(async () => {
      expect(await mint()).toEqual({ kind: "refused", reason: sealed });
      expect(await reconcileErrandPush(io)).toEqual({ kind: "failed", error: expect.objectContaining({ message: sealed }) });
      expect(await git(root, "for-each-ref", errandsRef(IDENTITY))).toBe("");
    });
    expect(await mint()).toMatchObject({ kind: "applied", value: "alpha" });
    expect(await git(root, "for-each-ref", "--format=%(refname)", errandsRef(IDENTITY))).toBe(errandsRef(IDENTITY));
  });
});
