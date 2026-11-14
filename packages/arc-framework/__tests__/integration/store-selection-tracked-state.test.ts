/** A ref store composed over a checkout whose HEAD still tracks ARC state refuses at its first use. */

import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { selectStore } from "../../src/lib/store/create.js";
import { findTrackedStateRoots, TRACKED_STATE_ROOTS } from "../../src/lib/store/selection.js";
import type { StoreResult } from "../../src/lib/store/refusal.js";
import { cleanupTempDir, commitAll, createTempRepo, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";

const execFileAsync = promisify(execFile);
const REGISTRY = "refs/arc/project/registry";
const cleanup: string[] = [];

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

async function repository(): Promise<string> {
  const root = await createTempRepo("arc-tracked-state-");
  cleanup.push(root);
  return root;
}

async function track(root: string, path: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), "tracked\n", "utf8");
  await commitAll(root, `track ${path}`);
}

function store(checkoutRoot: string) {
  return selectStore(testStorePorts(checkoutRoot, makeGitExec(checkoutRoot), makeGitExecInput(checkoutRoot)), {});
}

function refusalOf(result: StoreResult<unknown>) {
  if (result.status !== "refused") throw new Error(`Expected a refusal, got ${JSON.stringify(result)}`);
  return result.refusal;
}

/** Assert no store write reached the repository: no ref store directory, and no state refs. */
async function expectNoStoreWrites(root: string): Promise<void> {
  const commonDir = await git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  await expect(lstat(join(commonDir, "arc"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await git(root, "for-each-ref", "refs/arc/")).toBe("");
}

const provenance = { verb: "test", lifecycleAction: "update" };

afterEach(async () => { await Promise.all(cleanup.splice(0).map((dir) => cleanupTempDir(dir))); });

describe("the tracked-state refusal", () => {
  it.each(TRACKED_STATE_ROOTS.map((root) => [root]))("refuses at first use, before any store write, over a tree tracking %s",
    async (stateRoot) => {
      const root = await repository();
      await track(root, `${stateRoot}record.md`);
      const reference = createReferenceFixture().reference("work-item/meta");
      const refusal = refusalOf(await store(root).write({ action: "put", reference, expected: null, content: "x", provenance }));
      expect(refusal).toMatchObject({ code: "tracked-state", class: "recoverable", roots: [stateRoot] });
      await expectNoStoreWrites(root);
    });

  it("names the deletion of the tracked roots and the base merge where the store has been imported", async () => {
    const root = await repository();
    await track(root, ".arc/active/meta-one.md");
    await track(root, ".arc/system/.internal/transitions/one.json");
    await git(root, "update-ref", REGISTRY, await git(root, "rev-parse", "HEAD"));
    const refusal = refusalOf(await store(root).version());
    expect(refusal.remedy.text).toContain("git rm -r -- .arc/active/ .arc/system/.internal/transitions/");
    expect(refusal.remedy.text).toMatch(/commit the deletion/u);
    expect(refusal.remedy.text).toMatch(/git merge origin\/main/u);
    expect(refusal.remedy.text).not.toMatch(/store migrate --import/u);
  });

  it("names both routes and the fact that decides between them where no imported store is present", async () => {
    const root = await repository();
    await track(root, ".arc/backlog/stub.md");
    const refusal = refusalOf(await store(root).version());
    expect(refusal.remedy.text).toMatch(/origin.*base branch|base branch.*origin/u);
    expect(refusal.remedy.text).toContain("git rm -r -- .arc/backlog/");
    expect(refusal.remedy.text).toContain("arc store migrate --import");
  });

  it("never names the in-repo override", async () => {
    const root = await repository();
    await track(root, ".arc/completed/archive.md");
    const absent = refusalOf(await store(root).version());
    await git(root, "update-ref", REGISTRY, await git(root, "rev-parse", "HEAD"));
    const present = refusalOf(await store(root).version());
    for (const refusal of [absent, present]) expect(JSON.stringify(refusal)).not.toContain("ARC_IN_REPO_STORE");
  });

  it("still refuses while the deletion is only staged, and opens once it is committed", async () => {
    const root = await repository();
    await track(root, ".arc/active/meta-one.md");
    await git(root, "rm", "-r", "-q", "--", ".arc/active/");
    expect(refusalOf(await store(root).version())).toMatchObject({ code: "tracked-state" });
    await git(root, "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "delete tracked state");
    expect(await store(root).version()).toMatchObject({ status: "ok" });
  });

  it("composes the ref backend over a tree that tracks no state", async () => {
    const root = await repository();
    await track(root, ".arc/system/arc-config.yml");
    expect(await store(root).version()).toMatchObject({ status: "ok" });
  });

  it("composes the ref backend over an unborn HEAD", async () => {
    const root = await repository();
    expect(await store(root).version()).toMatchObject({ status: "ok" });
  });

  it("reads the whole tree from a checkout root below the repository's top level", async () => {
    const root = await repository();
    await track(root, ".arc/active/meta-one.md");
    const nested = join(root, "packages", "nested");
    await mkdir(nested, { recursive: true });
    expect(refusalOf(await store(nested).version())).toMatchObject({ code: "tracked-state", roots: [".arc/active/"] });
  });

  it("finds nothing tracked outside a Git repository", async () => {
    const outside = await mkdtemp(join(tmpdir(), "arc-not-a-repository-"));
    cleanup.push(outside);
    expect(await findTrackedStateRoots(makeGitExec(outside))).toEqual([]);
  });
});
