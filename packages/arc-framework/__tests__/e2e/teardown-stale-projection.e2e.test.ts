/** Real CLI retirement of a checkout whose tracked lifecycle predates separate archival. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile, access, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import {
  decodeWorktreeHuskStamp, readWorktreeMarker, writeWorktreeMarker, writeWorktreeOwnershipMarker,
} from "../../src/lib/git/worktree-marker.js";
import { createGitExec, readGitBlobBytes } from "../../src/lib/io-context.js";
import { hasCompetingLifecycleProjection } from "../../src/lib/work-unit/teardown-lifecycle-projection.js";
import type { TeardownAuthorizationDecision } from "../../src/lib/work-unit/retirement-authority.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

async function commitFixture(repo: string, message: string): Promise<void> {
  await git(repo, ["add", "-A"]);
  const tree = await git(repo, ["write-tree"]);
  const parent = await git(repo, ["rev-parse", "--verify", "HEAD"]).catch(() => null);
  const head = await git(repo, ["commit-tree", tree, ...(parent === null ? [] : ["-p", parent]), "-m", message]);
  await git(repo, ["update-ref", "HEAD", head, ...(parent === null ? [] : [parent])]);
}

async function prepareArchivedFeature(
  repo: string, parent: string, liveRemote = false, state: "Active" | "Integrating" = "Active", crlf = false,
): Promise<string> {
  const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
  expect(init.exitCode, init.stdout + init.stderr).toBe(0);
  if (liveRemote) {
    await writeFile(join(repo, ".arc", "system", "arc-config.yml"), "branch.base: main\nbranch.protection: full\n");
    const origin = join(parent, "origin.git");
    await git(repo, ["init", "--bare", "--initial-branch=main", origin]);
    await git(repo, ["remote", "add", "origin", origin]);
  }
  await commitFixture(repo, "chore: initialize");
  await git(repo, ["checkout", "-b", "feat/demo"]);
  await mkdir(join(repo, ".arc", "active"), { recursive: true });
  await writeFile(join(repo, ".arc", "active", "meta-demo.md"), renderMetaFile("demo", {
    state, branch: "feat/demo", owner: "test-user",
  }));
  await writeFile(join(repo, "demo.txt"), "demo\n");
  await commitFixture(repo, "feat: demo");
  if (liveRemote) await git(repo, ["push", "-u", "origin", "feat/demo"]);
  await git(repo, ["checkout", "main"]);
  await git(repo, ["merge", "--no-ff", "feat/demo", "-m", "merge: demo"]);
  await git(repo, ["checkout", "-b", "chore/archive-demo"]);
  const archive = await runArc(["archive", "demo", "--pr-url", "https://github.com/owner/repo/pull/1"], repo);
  expect(archive.exitCode, archive.stdout + archive.stderr).toBe(0);
  await commitFixture(repo, "chore: archive demo");
  await git(repo, ["checkout", "main"]);
  await git(repo, ["merge", "--no-ff", "chore/archive-demo", "-m", "merge: archive demo"]);
  if (liveRemote) await git(repo, ["push", "origin", "main"]);
  if (crlf) await git(repo, ["config", "core.autocrlf", "true"]);
  const worktree = join(parent, "demo");
  await git(repo, ["worktree", "add", worktree, "feat/demo"]);
  await writeWorktreeOwnershipMarker(worktree, {
    createdByArc: true, createdFor: { kind: "work-unit", name: "demo" }, spawningIdentity: "test-user",
  });
  expect(await git(worktree, ["status", "--porcelain"])).toBe("");
  return worktree;
}

describe("arc teardown with stale active lifecycle", () => {
  let repo: string | undefined;
  let parent: string | undefined;
  afterEach(async () => {
    if (repo !== undefined) await cleanupTempDir(repo);
    if (parent !== undefined) await cleanupTempDir(parent);
    repo = undefined;
    parent = undefined;
  });

  it.each(["Active", "Integrating"] as const)("reaps its own archived %s branch and replays the husk", async (state) => {
    repo = await createTempRepo();
    parent = await mkdtemp(join(tmpdir(), "arc-stale-teardown-"));
    const worktree = await prepareArchivedFeature(repo, parent, false, state);
    const head = await git(worktree, ["rev-parse", "HEAD"]);
    const meta = await readFile(join(worktree, ".arc", "active", "meta-demo.md"), "utf8");

    const created = await runArc(["teardown", "demo"], worktree);

    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    expect(created.stdout + created.stderr).not.toMatch(/competing registered projection/iu);
    expect(await git(repo, ["branch", "--list", "feat/demo"])).toBe("");
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    expect(await git(worktree, ["rev-parse", "HEAD"])).toBe(head);
    expect(await readFile(join(worktree, ".arc", "active", "meta-demo.md"), "utf8")).toBe(meta);
    const marker = await readWorktreeMarker(worktree);
    expect(marker.kind).toBe("present");
    if (marker.kind === "present") expect(marker.marker.husk?.sha).toBe(head);
    const replay = await runArc(["teardown", "demo", "--husk", worktree], worktree);
    expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);
    expect(replay.stdout + replay.stderr).not.toMatch(/competing registered projection/iu);
    const removed = await runArc(["teardown", "demo", "--husk", worktree], repo);
    expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
    await expect(access(worktree)).rejects.toThrow();
  });

  it("reaps the leased remote and local refs from its stale active checkout", async () => {
    repo = await createTempRepo();
    parent = await mkdtemp(join(tmpdir(), "arc-stale-teardown-"));
    const worktree = await prepareArchivedFeature(repo, parent, true);
    const head = await git(worktree, ["rev-parse", "HEAD"]);
    const created = await runArc(["teardown", "demo"], worktree);
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    expect(await git(repo, ["ls-remote", "--heads", "origin", "feat/demo"])).toBe("");
    expect(await git(repo, ["branch", "--list", "feat/demo"])).toBe("");
    expect(await git(worktree, ["rev-parse", "HEAD"])).toBe(head);
  });

  it("reaps stale metadata after Git converts its clean checkout to CRLF", async () => {
    repo = await createTempRepo();
    parent = await mkdtemp(join(tmpdir(), "arc-stale-teardown-"));
    const worktree = await prepareArchivedFeature(repo, parent, false, "Active", true);
    expect(await readFile(join(worktree, ".arc", "active", "meta-demo.md"), "utf8")).toContain("\r\n");
    const created = await runArc(["teardown", "demo"], worktree);
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    expect(await git(repo, ["branch", "--list", "feat/demo"]), created.stdout + created.stderr).toBe("");
    const removed = await runArc(["teardown", "demo", "--husk", worktree], repo);
    expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
    await expect(access(worktree)).rejects.toThrow();
  });

  it("retries a failed local deletion from the stale husk", async () => {
    repo = await createTempRepo();
    parent = await mkdtemp(join(tmpdir(), "arc-stale-teardown-"));
    const worktree = await prepareArchivedFeature(repo, parent);
    const head = await git(worktree, ["rev-parse", "HEAD"]);
    const lock = join(repo, ".git", "refs", "heads", "feat", "demo.lock");
    await writeFile(lock, "held by fixture\n");
    const created = await runArc(["teardown", "demo"], worktree);
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    expect(await git(repo, ["rev-parse", "feat/demo"])).toBe(head);
    expect(created.stdout + created.stderr).toMatch(/Could not compare-and-delete local branch/iu);
    await rm(lock);
    const retried = await runArc(["teardown", "demo", "--husk", worktree], worktree);
    expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
    expect(await git(repo, ["branch", "--list", "feat/demo"]), retried.stdout + retried.stderr).toBe("");
    expect(await git(worktree, ["rev-parse", "HEAD"])).toBe(head);
    const removed = await runArc(["teardown", "demo", "--husk", worktree], repo);
    expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
    await expect(access(worktree)).rejects.toThrow();
  });

  it.each([
    "foreign path", "nested foreign projection", "different source head", "different authorization", "different remote proof",
    "incompatible lifecycle", "local meta edit", "unknown stamp", "missing stamp", "different subject", "moved HEAD",
  ])("vetoes a stale-projection exclusion with %s, then accepts repaired evidence", async (changed) => {
    repo = await createTempRepo();
    parent = await mkdtemp(join(tmpdir(), "arc-stale-teardown-"));
    const worktree = await prepareArchivedFeature(repo, parent);
    const created = await runArc(["teardown", "demo"], worktree);
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    const marker = await readWorktreeMarker(worktree);
    if (marker.kind !== "present" || marker.marker.husk === undefined) throw new Error("missing produced husk");
    const stamp = marker.marker.husk;
    const decoded = decodeWorktreeHuskStamp(stamp);
    if (decoded.kind !== "current") throw new Error("missing produced retirement evidence");
    const proof: Extract<TeardownAuthorizationDecision, { status: "authorized" }> = {
      status: "authorized", authorityVersion: "persisted-husk", authorization: decoded.authorization,
      evidence: decoded.evidence, refs: { localOid: stamp.sha, remote: decoded.remoteRef },
    };
    const exec = createGitExec();
    const ctx = {
      cwd: worktree,
      exec: ((command, args, options) => exec(command, args, { ...options, cwd: options?.cwd ?? worktree })) as typeof exec,
      indexFs: { readdir: (p: string) => readdir(p, { withFileTypes: true }), readFile: (p: string) => readFile(p, "utf8") },
      readBlob: (ref: string, path: Parameters<typeof readGitBlobBytes>[2]) => readGitBlobBytes(worktree, ref, path),
    };
    const competes = (candidate = proof, path = worktree) =>
      hasCompetingLifecycleProjection(ctx, "feat/demo", candidate, path);
    expect(await competes()).toBe(false);
    const metaPath = join(worktree, ".arc", "active", "meta-demo.md");
    const content = await readFile(metaPath, "utf8");
    let candidate = proof;
    let path = worktree;
    switch (changed) {
      case "foreign path": path = repo; break;
      case "nested foreign projection": {
        const nested = join(worktree, "nested");
        await mkdir(join(nested, ".arc", "active"), { recursive: true });
        await writeFile(join(nested, ".arc", "active", "meta-demo.md"), content);
        ctx.cwd = nested;
        break;
      }
      case "different source head": candidate = { ...proof, refs: { ...proof.refs, localOid: "0".repeat(40) } }; break;
      case "different authorization": candidate = { ...proof, authorization: "discard-confirmed" }; break;
      case "different remote proof":
        candidate = { ...proof, refs: { ...proof.refs, remote: { remote: "other", oid: stamp.sha, disposition: "retain" } } };
        break;
      case "incompatible lifecycle":
        await writeFile(metaPath, renderMetaFile("demo", { state: "Planning", branch: "feat/demo", owner: "test-user" }));
        break;
      case "local meta edit": await writeFile(metaPath, content + "\nA new local edit.\n"); break;
      case "unknown stamp":
        await writeWorktreeMarker(worktree, { ...marker.marker, husk: { ...stamp, authorization: "future" } }); break;
      case "missing stamp": await writeWorktreeMarker(worktree, { ...marker.marker, husk: undefined }); break;
      case "different subject":
        await writeWorktreeMarker(worktree, { ...marker.marker, husk: { ...stamp, subject: { kind: "work-unit", name: "other" } } });
        break;
      case "moved HEAD":
        await writeFile(join(worktree, "later.txt"), "later\n");
        await commitFixture(worktree, "chore: changed detached head");
        break;
      default: throw new Error("unhandled evidence case");
    }
    expect(await competes(candidate, path)).toBe(true);
    ctx.cwd = worktree;
    await rm(join(worktree, "nested"), { recursive: true, force: true });
    await writeFile(metaPath, content);
    await writeWorktreeMarker(worktree, marker.marker);
    await git(worktree, ["checkout", "--detach", stamp.sha]);
    expect(await competes()).toBe(false);
    const removed = await runArc(["teardown", "demo", "--husk", worktree], repo);
    expect(removed.exitCode, removed.stdout + removed.stderr).toBe(0);
    await expect(access(worktree)).rejects.toThrow();
  });
});
