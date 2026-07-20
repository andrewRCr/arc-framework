import { afterEach, describe, expect, it } from "vitest";
import { rm, symlink } from "node:fs/promises";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { computeChangeSetId } from "../../src/scripts/review-gate/core/identity.js";
import { resolveCoverageIdentity } from "../../src/scripts/review-gate/hosts/github/coverage.js";
import { resolveSelfHostingReviewRouting } from "../../src/scripts/review-gate/policy/self-hosting/routing.js";
import {
  cleanupTempDir,
  createTempRepo,
  dirname,
  execFileAsync,
  join,
  makeCommit,
  makeGitExec,
  mkdir,
  writeFile,
} from "../helpers/integration.js";

describe("trusted-base coverage identity", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => cleanupTempDir(dir)));
  });

  async function repo(): Promise<string> {
    const dir = await createTempRepo("review-gate-coverage-");
    tempDirs.push(dir);
    return dir;
  }

  async function write(dir: string, path: string, content: string): Promise<void> {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }

  async function commit(dir: string, message: string): Promise<string> {
    await execFileAsync("git", ["add", "-A"], { cwd: dir });
    return makeCommit(dir, message);
  }

  async function git(dir: string, args: string[]): Promise<void> {
    await execFileAsync("git", args, { cwd: dir });
  }

  /** Base commit `c0` on `main`, head `h1` branched from it, published at refs/pull/5/head. */
  async function forkTopology(dir: string): Promise<{ c0: string; h1: string }> {
    await write(dir, "base.txt", "base\n");
    const c0 = await commit(dir, "c0 base");
    await git(dir, ["checkout", "-b", "pr-head"]);
    await write(dir, "feature.txt", "feature\n");
    const h1 = await commit(dir, "h1 feature");
    await git(dir, ["checkout", "main"]);
    await git(dir, ["update-ref", "refs/pull/5/head", h1]);
    return { c0, h1 };
  }

  it("resolves the reviewed diff from the merge base without checkout", async () => {
    const dir = await repo();
    const { c0, h1 } = await forkTopology(dir);
    const result = await resolveCoverageIdentity({ exec: makeGitExec(dir), baseRemote: ".", baseRef: "main", headSha: h1, prNumber: 5 });
    expect(result).toEqual({
      kind: "resolved",
      baseRef: "main",
      baseSha: c0,
      diffBaseSha: c0,
      headSha: h1,
      changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: c0, headSha: h1 }),
      changedPaths: [{
        status: "added",
        path: "feature.txt",
        oldMode: "000000",
        newMode: "100644",
      }],
    });
  });

  it("holds change-set id across a base-tip advance but changes on retarget and merge-base movement", async () => {
    const dir = await repo();
    const { c0, h1 } = await forkTopology(dir);
    const exec: GitExec = makeGitExec(dir);
    const baseline = await resolveCoverageIdentity({ exec, baseRemote: ".", baseRef: "main", headSha: h1, prNumber: 5 });
    if (baseline.kind !== "resolved") throw new Error("expected resolved baseline");

    // Base tip advances with a commit not in the head's history: merge base unchanged.
    await write(dir, "base2.txt", "more\n");
    const c1 = await commit(dir, "c1 base advance");
    const advanced = await resolveCoverageIdentity({ exec, baseRemote: ".", baseRef: "main", headSha: h1, prNumber: 5 });
    if (advanced.kind !== "resolved") throw new Error("expected resolved after advance");
    expect(advanced.diffBaseSha).toBe(c0);
    expect(advanced.baseSha).toBe(c1);
    expect(advanced.changeSetId).toBe(baseline.changeSetId);

    // Retarget to a different base ref at the same merge base: identity changes.
    await git(dir, ["branch", "release", c0]);
    const retargeted = await resolveCoverageIdentity({ exec, baseRemote: ".", baseRef: "release", headSha: h1, prNumber: 5 });
    if (retargeted.kind !== "resolved") throw new Error("expected resolved after retarget");
    expect(retargeted.diffBaseSha).toBe(c0);
    expect(retargeted.changeSetId).not.toBe(baseline.changeSetId);

    // Head rebased onto the newer base: merge base moves, identity changes.
    await git(dir, ["checkout", "-b", "pr-head2", c1]);
    await write(dir, "feature.txt", "feature\n");
    const h2 = await commit(dir, "h2 feature on c1");
    await git(dir, ["checkout", "main"]);
    await git(dir, ["update-ref", "refs/pull/6/head", h2]);
    const moved = await resolveCoverageIdentity({ exec, baseRemote: ".", baseRef: "main", headSha: h2, prNumber: 6 });
    if (moved.kind !== "resolved") throw new Error("expected resolved after merge-base move");
    expect(moved.diffBaseSha).toBe(c1);
    expect(moved.changeSetId).not.toBe(baseline.changeSetId);
  });

  it("fails sensitive on missing, force-pushed, and mismatched head objects", async () => {
    const dir = await repo();
    const { c0, h1 } = await forkTopology(dir);
    const exec: GitExec = makeGitExec(dir);

    // No refs/pull/7/head published: the trusted fetch cannot acquire the object.
    expect(await resolveCoverageIdentity({ exec, baseRemote: ".", baseRef: "main", headSha: h1, prNumber: 7 })).toEqual({
      kind: "sensitive",
      reason: "objects-unavailable",
    });

    // Published head differs from the expected SHA (force-push / moved head).
    await git(dir, ["update-ref", "refs/pull/8/head", c0]);
    expect(await resolveCoverageIdentity({ exec, baseRemote: ".", baseRef: "main", headSha: h1, prNumber: 8 })).toEqual({
      kind: "sensitive",
      reason: "head-mismatch",
    });
  });

  it("rejects fork-controlled ref or remote input before running git", async () => {
    const dir = await repo();
    await forkTopology(dir);
    const calls: string[][] = [];
    const real = makeGitExec(dir);
    const exec: GitExec = (cmd, args, options) => {
      calls.push(args);
      return real(cmd, args, options);
    };
    const head = "b".repeat(40);
    for (const baseRef of ["main; rm -rf /", "-oops", "main\nhack", "../evil"]) {
      expect(await resolveCoverageIdentity({ exec, baseRemote: ".", baseRef, headSha: head, prNumber: 5 })).toEqual({
        kind: "sensitive",
        reason: "invalid-identity",
      });
    }
    expect(await resolveCoverageIdentity({ exec, baseRemote: "-upload-pack=evil", baseRef: "main", headSha: head, prNumber: 5 })).toEqual({
      kind: "sensitive",
      reason: "invalid-identity",
    });
    expect(calls).toHaveLength(0);
  });

  it("preserves arbitrary valid Git filenames and rename provenance", async () => {
    const dir = await repo();
    await write(dir, "rename-me.txt", "same\n");
    await commit(dir, "c0 base");
    await git(dir, ["checkout", "-b", "pr-head"]);
    await write(dir, "with space.txt", "a\n");
    await write(dir, "café.txt", "b\n");
    await write(dir, "line\nbreak.txt", "c\n");
    await git(dir, ["mv", "rename-me.txt", "renamed.txt"]);
    const h1 = await commit(dir, "weird names + rename");
    await git(dir, ["checkout", "main"]);
    await git(dir, ["update-ref", "refs/pull/5/head", h1]);

    const result = await resolveCoverageIdentity({ exec: makeGitExec(dir), baseRemote: ".", baseRef: "main", headSha: h1, prNumber: 5 });
    if (result.kind !== "resolved") throw new Error("expected resolved");
    const paths = new Set(result.changedPaths.map((change) => change.path));
    expect(paths.has("with space.txt")).toBe(true);
    expect(paths.has("café.txt")).toBe(true);
    expect(paths.has("line\nbreak.txt")).toBe(true);
    expect(result.changedPaths).toContainEqual({
      status: "renamed",
      path: "renamed.txt",
      previousPath: "rename-me.txt",
      oldMode: "100644",
      newMode: "100644",
    });
  });

  it("returns all six canonical statuses with exact modes and copy provenance", async () => {
    const dir = await repo();
    await write(dir, "modified.txt", "before\n");
    await write(dir, "deleted.txt", "delete\n");
    await write(dir, "renamed.txt", "rename\n");
    await write(dir, "copy-source.txt", "copy\n");
    await write(dir, "type-target", "regular\n");
    await write(dir, ".arc/active/meta-owned.md", renderMetaFile("owned", { Owner: "andrew" }));
    await write(dir, ".arc/active/tasks-owned.md", "before\n");
    await commit(dir, "base shapes");
    await git(dir, ["checkout", "-b", "pr-head"]);

    await write(dir, "added.txt", "added\n");
    await write(dir, "modified.txt", "after\n");
    await git(dir, ["rm", "deleted.txt"]);
    await git(dir, ["mv", "renamed.txt", "moved.txt"]);
    await write(dir, "copied.txt", "copy\n");
    await write(dir, ".arc/active/tasks-owned.md", "after\n");
    await rm(join(dir, "type-target"));
    await symlink("copy-source.txt", join(dir, "type-target"));
    const head = await commit(dir, "all statuses");
    await git(dir, ["checkout", "main"]);
    await git(dir, ["update-ref", "refs/pull/9/head", head]);

    const result = await resolveCoverageIdentity({
      exec: makeGitExec(dir),
      baseRemote: ".",
      baseRef: "main",
      headSha: head,
      prNumber: 9,
    });
    if (result.kind !== "resolved") throw new Error("expected resolved");

    expect(result.changedPaths).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "added", path: "added.txt", oldMode: "000000", newMode: "100644" }),
      expect.objectContaining({ status: "modified", path: "modified.txt", oldMode: "100644", newMode: "100644" }),
      expect.objectContaining({ status: "deleted", path: "deleted.txt", oldMode: "100644", newMode: "000000" }),
      expect.objectContaining({ status: "renamed", path: "moved.txt", previousPath: "renamed.txt" }),
      expect.objectContaining({ status: "copied", path: "copied.txt", previousPath: "copy-source.txt" }),
      expect.objectContaining({ status: "type-changed", path: "type-target", oldMode: "100644", newMode: "120000" }),
    ]));

    const routing = await resolveSelfHostingReviewRouting({
      changeSet: { changeSet: "known", changes: result.changedPaths },
      exec: makeGitExec(dir),
      diffBaseSha: result.diffBaseSha,
      headSha: result.headSha,
      authorLogin: "andrewRCr",
      authorMap: { andrewRCr: "andrew" },
      changeDeterminacy: "ordinary",
      assurance: { workContext: "work-unit", workClass: "Heavy" },
      activity: { selfReview: true, frontlineReview: true },
    });
    expect(routing.facts).toMatchObject({
      changeSetState: "known",
      contentKind: "code-bearing",
      reviewRisk: "sensitive",
      ownership: "self",
      surfaceAuthority: "planning-grooming",
    });
    expect(routing.decision).toMatchObject({
      independentAnalysis: "required",
      retrigger: "full-final",
      assuranceMode: "terminal-aggregate",
      reasons: ["sensitive-change-set"],
    });
  });

  it.each([
    {
      label: "rename source",
      change: {
        status: "renamed",
        previousPath: "AGENTS.md",
        path: "docs/renamed.md",
        oldMode: "100644",
        newMode: "100644",
      },
      expected: { contentKind: "documentation", surfaceAuthority: "constitutional" },
    },
    {
      label: "copy destination",
      change: {
        status: "copied",
        previousPath: "docs/source.md",
        path: "packages/arc-framework/src/copied.ts",
        oldMode: "100644",
        newMode: "100644",
      },
      expected: { contentKind: "code-bearing", surfaceAuthority: "ordinary" },
    },
  ])("classifies both endpoints for a $label", async ({ change, expected }) => {
    const dir = await repo();
    const routing = await resolveSelfHostingReviewRouting({
      changeSet: { changeSet: "known", changes: [change] },
      exec: makeGitExec(dir),
      diffBaseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      authorLogin: "andrewRCr",
      authorMap: { andrewRCr: "andrew" },
      changeDeterminacy: "ordinary",
      assurance: { workContext: "work-unit", workClass: "Light" },
      activity: { selfReview: true, frontlineReview: true },
    });

    expect(routing.facts).toMatchObject({
      changeSetState: "known",
      reviewRisk: "sensitive",
      ownership: "not-applicable",
      ...expected,
    });
  });

  it.each([
    ["empty known set", { changeSet: "known", changes: [] }],
    ["path-only legacy fact", { changeSet: "known", changes: [{ status: "modified", path: "src/file.ts" }] }],
    ["four-status legacy fact", {
      changeSet: "known",
      changes: [{ status: "changed", path: "src/file.ts", oldMode: "100644", newMode: "100644" }],
    }],
    ["rename without origin", {
      changeSet: "known",
      changes: [{ status: "renamed", path: "new.ts", oldMode: "100644", newMode: "100644" }],
    }],
    ["copy without origin", {
      changeSet: "known",
      changes: [{ status: "copied", path: "copy.ts", oldMode: "100644", newMode: "100644" }],
    }],
  ])("fails closed for %s at the classifier-to-router boundary", async (_label, changeSet) => {
    const dir = await repo();
    const routing = await resolveSelfHostingReviewRouting({
      changeSet,
      exec: makeGitExec(dir),
      diffBaseSha: "a".repeat(40),
      headSha: "b".repeat(40),
      authorLogin: "andrewRCr",
      authorMap: { andrewRCr: "andrew" },
      changeDeterminacy: "ordinary",
      assurance: { workContext: "work-unit", workClass: "Light" },
      activity: { selfReview: true, frontlineReview: true },
    });

    expect(routing.facts.changeSetState).toBe("unknown");
    expect(routing.decision).toMatchObject({
      independentAnalysis: "required",
      retrigger: "full-final",
      reasons: ["unknown-change-set"],
    });
  });

  it("fails sensitive when the byte-preserving diff contains malformed UTF-8", async () => {
    const dir = await repo();
    const { h1 } = await forkTopology(dir);
    const zero = "0".repeat(40);
    const object = "1".repeat(40);
    const header = Buffer.from(`:000000 100644 ${zero} ${object} A\0`, "utf8");
    const malformed = Buffer.concat([header, Buffer.from([0x66, 0x80, 0x6f, 0x00])]);

    await expect(resolveCoverageIdentity({
      exec: makeGitExec(dir),
      rawExec: async () => ({ stdout: malformed }),
      baseRemote: ".",
      baseRef: "main",
      headSha: h1,
      prNumber: 5,
    })).resolves.toEqual({ kind: "sensitive", reason: "diff-unresolvable" });
  });
});
