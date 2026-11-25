/** A ref store composed over a checkout whose HEAD still tracks ARC state refuses at its first use. */

import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { createStore, selectStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-store-ports.js";
import { bindProjectionFanOut, disposeProjectionFanOut } from "../../src/lib/store/projection/fan-out-binding.js";
import { locateProjection } from "../../src/lib/store/projection/location.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { findTrackedStateRoots } from "../../src/lib/store/selection.js";
import type { StoreResult } from "../../src/lib/store/refusal.js";
import { cleanupTempDir, commitAll, createTempRepo, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";

const execFileAsync = promisify(execFile);
const REGISTRY = "refs/arc/project/registry";
const STATE_ROOTS = [".arc/active/", ".arc/backlog/", ".arc/completed/", ".arc/system/.internal/candidates/",
  ".arc/system/.internal/transitions/"];
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

function recoveryArgs(remedy: string, verb: string): string[] {
  const command = remedy.split("`").find((part, index) => index % 2 === 1 && part.startsWith(`git ${verb} `));
  if (command === undefined) throw new Error(`Missing git ${verb} command in ${remedy}`);
  return command.slice("git ".length).split(" ");
}

function expectBranchComparisonBeforeRemoval(remedy: string): void {
  const [beforeRemoval, afterRemoval] = remedy.split("git rm");
  expect(beforeRemoval).toMatch(/compar\w*.*local.*(?:host|origin).*tips?.*record/isu);
  expect(beforeRemoval).toMatch(/(?:merge|incorporate).*host.*commits/isu);
  expect(afterRemoval).toMatch(/reappl\w*.*state.*store/isu);
}

function expectCheckoutRecovery(remedy: string): void {
  const liveBranch = remedy.slice(remedy.indexOf("git rm"));
  expect(liveBranch).toMatch(/cutover window.*checkout steps/isu);
  const [beforeReplay, afterReplay] = liveBranch.split(/reappl\w*.*?state.*?store/isu);
  expect(beforeReplay).toMatch(/personal digest/iu);
  expect(beforeReplay).toMatch(/materializ/iu);
  expect(beforeReplay).toMatch(/withheld personal files/iu);
  expect(beforeReplay).toMatch(/marker bind|bind.*marker/iu);
  expect(afterReplay).toMatch(/confirm.*range.*exact tip.*run the command again/isu);
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
  it.each(STATE_ROOTS)("refuses at first use, before any store write, over a tree tracking %s",
    async (stateRoot) => {
      const root = await repository();
      await track(root, `${stateRoot}record.md`);
      const reference = createReferenceFixture().reference("work-item/meta");
      const refusal = refusalOf(await store(root).write({ action: "put", reference, expected: null, content: "x", provenance }));
      expect(refusal).toMatchObject({ code: "tracked-state", class: "recoverable", roots: [stateRoot] });
      await expectNoStoreWrites(root);
    });

  it("uses the target checkout for the refusal and its remedy when Git defaults to another repository", async () => {
    const target = await repository();
    await track(target, ".arc/active/meta-one.md");
    await git(target, "update-ref", REGISTRY, "HEAD");
    const other = await repository();
    await track(other, "README.md");

    const ports = testStorePorts(target, makeGitExec(other), makeGitExecInput(other));
    const refusal = refusalOf(await selectStore(ports, {}).version());
    expect(refusal).toMatchObject({ code: "tracked-state", roots: [".arc/active/"] });
    expect(refusal.remedy.text).not.toContain("arc store migrate --import");
    await git(target, "rm", "-r", ".arc/active/");
    await commitAll(target, "delete tracked state");
    expect(await selectStore(ports, {}).version()).toMatchObject({ status: "ok" });
  });

  it("does not fan out when the public store refuses sync in a linked checkout", async () => {
    const primary = await repository();
    await commitAll(primary, "seed clean checkout");
    const sibling = await mkdtemp(join(tmpdir(), "arc-tracked-sibling-"));
    cleanup.push(sibling);
    await git(primary, "worktree", "add", "--detach", sibling);
    await track(sibling, ".arc/active/record.md");

    const command = beginProjectionCommand();
    onTestFinished(disposeProjectionFanOut);
    const ports = createDefaultStorePorts({ checkoutRoot: primary });
    let rounds = 0;
    await bindProjectionFanOut({ checkout: primary, location: await locateProjection(primary, ports), ports,
      run: async () => { rounds++; return undefined; } });
    expect(command.fanOutBinding?.active).toBe(true);

    const linkedStore = createStore(createDefaultStorePorts({ checkoutRoot: sibling }));
    for (const operation of ["pull", "push"] as const) {
      expect(refusalOf(await linkedStore[operation]())).toMatchObject({ code: "tracked-state", roots: [".arc/active/"] });
      expect.soft(rounds, `projection rounds after refused ${operation}`).toBe(0);
    }
  });

  it("directs a live branch to compare before deletion where the store has been imported", async () => {
    const root = await repository();
    await track(root, ".arc/active/meta-one.md");
    await git(root, "switch", "-c", "work");
    await track(root, ".arc/system/.internal/transitions/one.json");
    await git(root, "update-ref", REGISTRY, await git(root, "rev-parse", "HEAD"));
    const refusal = refusalOf(await store(root).version());
    expect(refusal.remedy.text).toMatch(/git rm\b[^`]*\.arc\/active\/[^`]*\.arc\/system\/\.internal\/transitions\//u);
    expect(refusal.remedy.text).toMatch(/commit the deletion/iu);
    expect(refusal.remedy.text).toMatch(/git merge origin\/main/u);
    expect(refusal.remedy.text).not.toMatch(/store migrate --import/u);
    expectBranchComparisonBeforeRemoval(refusal.remedy.text);
    expectCheckoutRecovery(refusal.remedy.text);
  });

  it("names both routes and the fact that decides between them where no imported store is present", async () => {
    const root = await repository();
    await track(root, ".arc/backlog/stub.md");
    await git(root, "switch", "-c", "work");
    const refusal = refusalOf(await store(root).version());
    expect(refusal.remedy.text).toMatch(/origin.*base branch|base branch.*origin/u);
    expect(refusal.remedy.text).toMatch(/git rm\b[^`]*\.arc\/backlog\//u);
    expect(refusal.remedy.text).toContain("arc store migrate --import");
    expectBranchComparisonBeforeRemoval(refusal.remedy.text);
    expectCheckoutRecovery(refusal.remedy.text);
  });

  it.each([true, false])("gives stale main a merge-only route (local registry: %s)", async (imported) => {
    const root = await repository();
    await track(root, ".arc/active/record.md");
    await git(root, "switch", "-c", "cutover");
    await git(root, "rm", "-r", ".arc/active/");
    await commitAll(root, "delete tracked state");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    if (imported) await git(root, "update-ref", REGISTRY, "HEAD");
    await git(root, "switch", "main");

    const { remedy } = refusalOf(await store(root).version());
    const mainRoute = remedy.text.split("\n").find((line) => /(?:on|if.*on) `main`/iu.test(line)) ?? "";
    expect(mainRoute).toMatch(/\bgit merge origin\/main\b/u);
    expect(mainRoute).not.toMatch(/git rm|commit the deletion/u);
    await git(root, ...recoveryArgs(mainRoute, "merge"));
    expect(await store(root).version()).toMatchObject({ status: "ok" });
  });

  it("directs recovery from a subdirectory to the repository top level for both Git commands", async () => {
    const root = await repository();
    const record = ".arc/active/record.md";
    await track(root, record);
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    await git(root, "switch", "-c", "work");
    const nested = join(root, "packages");
    await mkdir(nested);

    const refusal = refusalOf(await store(nested).version());
    expect(refusal).toMatchObject({ code: "tracked-state", roots: [".arc/active/"] });
    expect(refusal.remedy.text).toMatch(/(?:top level|top-level).*git rev-parse --show-toplevel/iu);
    const top = await git(nested, ...recoveryArgs(refusal.remedy.text, "rev-parse"));
    const list = recoveryArgs(refusal.remedy.text, "ls-tree");
    expect(await git(top, ...list)).toBe(record);
    await git(top, ...recoveryArgs(refusal.remedy.text, "rm"));
    expect(await git(root, "diff", "--cached", "--diff-filter=D", "--name-only")).toBe(record);
    await commitAll(root, "delete tracked state");
    expect(await findTrackedStateRoots(makeGitExec(nested))).toEqual([]);
    expect(await store(root).version()).toMatchObject({ status: "ok" });
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

  it("finishes removing tracked state with literal pathspecs and one root's removal already staged", async () => {
    const root = await repository();
    await track(root, ".arc/active/meta-one.md");
    await track(root, ".arc/backlog/stub.md");
    await git(root, "update-ref", REGISTRY, "HEAD");
    await git(root, "switch", "-c", "work");
    await git(root, "rm", "-r", "--", ".arc/active/");

    const refusal = refusalOf(await store(root).version());
    await execFileAsync("git", recoveryArgs(refusal.remedy.text, "rm"), {
      cwd: root, env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" },
    });
    expect(await git(root, "ls-files", "--", ".arc/active/", ".arc/backlog/")).toBe("");
    await expect(lstat(join(root, ".arc/backlog/stub.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(refusal.remedy.text).toMatch(/check.*(?:on disk|disk copies).*before committing/isu);
    await commitAll(root, "delete tracked state");
    expect(await store(root).version()).toMatchObject({ status: "ok" });
  });

  it("keeps case-insensitive pathspecs from including files outside the protected roots", async () => {
    const root = await repository();
    const record = ".arc/active/record.md";
    await track(root, record);
    await track(root, ".arc/Backlog/other.md");
    await git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    const { remedy } = refusalOf(await store(root).version());
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_ICASE_PATHSPECS: "1" };
    if (/`unset GIT_ICASE_PATHSPECS`/u.test(remedy.text)) delete env.GIT_ICASE_PATHSPECS;

    const args = recoveryArgs(remedy.text, "rm");
    args.splice(1, 0, "--dry-run");
    const removal = await execFileAsync("git", args, { cwd: root, env });
    expect.soft(removal.stdout.trim()).toBe(`rm '${record}'`);
    const listing = await execFileAsync("git", recoveryArgs(remedy.text, "ls-tree"), { cwd: root, env });
    expect(listing.stdout.trim()).toBe(record);
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

  it("reports an unavailable HEAD tree and leaves it absent in a treeless clone", async () => {
    const source = await repository();
    await track(source, ".arc/active/meta-one.md");
    const tree = await git(source, "rev-parse", "HEAD^{tree}");
    await git(source, "config", "uploadpack.allowFilter", "true");
    const clone = await mkdtemp(join(tmpdir(), "arc-tracked-state-treeless-"));
    cleanup.push(clone);
    await git(source, "clone", "--filter=tree:0", "--no-checkout", pathToFileURL(source).href, clone);

    const treePresent = async () =>
      (await git(clone, "cat-file", "--batch-all-objects", "--batch-check=%(objectname)")).split("\n").includes(tree);
    expect(await treePresent()).toBe(false);
    const [inspection] = await Promise.allSettled([findTrackedStateRoots(makeGitExec(clone))]);
    expect({ treePresent: await treePresent(), inspection: inspection?.status })
      .toEqual({ treePresent: false, inspection: "rejected" });
    await git(clone, "checkout", "--force", "HEAD");
    expect(await findTrackedStateRoots(makeGitExec(clone))).toEqual([".arc/active/"]);
  });

  it("propagates the Git failure at first use when the branch's commit object is missing", async () => {
    const root = await repository();
    await track(root, ".arc/active/meta-one.md");
    const commit = await git(root, "rev-parse", "HEAD");
    const path = join(root, ".git", "objects", commit.slice(0, 2), commit.slice(2));
    await rename(path, `${path}.saved`);
    expect(await git(root, "rev-parse", "--verify", "refs/heads/main")).toBe(commit);
    await expect(store(root).version()).rejects.toMatchObject({ kind: "nonzero-exit" });
    await rename(`${path}.saved`, path);
    expect(refusalOf(await store(root).version())).toMatchObject({ code: "tracked-state" });
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
