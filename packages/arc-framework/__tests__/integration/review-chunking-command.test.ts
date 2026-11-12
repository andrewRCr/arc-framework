import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handleReviewChunkingResolve } from "../../src/handlers/review.js";
import { createSpawnRawGitExec } from "../../src/lib/change-facts.js";
import { readConfigSettings } from "../../src/lib/config/status-reader.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { resolveReviewChunkingCommand } from "../../src/scripts/review-gate/policy/review-chunking-command.js";

const repositories: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function repository(config: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-review-chunking-"));
  repositories.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"), config);
  await writeFile(join(root, "change.bin"), Buffer.from([0, 1, 2]));
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");
  return root;
}

function target(root: string, base: string, head: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: base,
    diffBaseTree: git(root, "rev-parse", `${base}^{tree}`),
    headSha: head,
    headTree: git(root, "rev-parse", `${head}^{tree}`),
  });
}

function coordinates(base: string, head: string) {
  return { kind: "change-set" as const, baseRef: "main", diffBaseSha: base, headSha: head };
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("review chunking command composition", () => {
  it.each(["index", "worktree"] as const)("sizes the %s subject without changing HEAD or the real index", async (localSubject) => {
    const root = await repository(
      "changeset.advisory_threshold_lines: 0\nchangeset.advisory_threshold_files: 2\n",
    );
    await writeFile(join(root, ".gitignore"), "ignored.txt\n");
    await writeFile(join(root, "tracked.txt"), "base\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "tracked base");
    const head = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "tracked.txt"), "staged\n");
    git(root, "add", "tracked.txt");
    await writeFile(join(root, "tracked.txt"), "unstaged\n");
    await writeFile(join(root, "new.txt"), "new\n");
    await writeFile(join(root, "ignored.txt"), "ignored\n");
    const indexBefore = await readFile(join(root, ".git/index"));
    const resolve = async (scopeSelection?: unknown, refused = false) => {
      const write = vi.fn();
      const setExitCode = vi.fn();
      await handleReviewChunkingResolve("-", {
        resolveRoot: () => root,
        readText: async () => JSON.stringify({
          schemaVersion: 1, target: coordinates(head, head), localSubject, scopeSelection,
        }),
        resolve: (request) => resolveReviewChunkingCommand(request, {
          readSettings: () => readConfigSettings(root),
          readDeliveryBinding: async () => ({ status: "authoritative-unbound" }),
          exec: createSpawnRawGitExec(root),
        }),
        write, setExitCode,
      });
      if (refused) expect(setExitCode).toHaveBeenCalledWith(1);
      else expect(setExitCode).not.toHaveBeenCalled();
      return JSON.parse(String(write.mock.calls[0]?.[0]));
    };
    const first = await resolve();
    expect(first).toMatchObject({
      state: localSubject === "index" ? "below-threshold" : "consider-chunks",
      payload: { metrics: { files: localSubject === "index" ? 1 : 2 } },
    });
    const snapshot = first.payload.target;
    expect(git(root, "show", `${snapshot.headSha}:tracked.txt`))
      .toBe(localSubject === "index" ? "staged" : "unstaged");
    expect(git(root, "ls-tree", "--name-only", snapshot.headSha)).not.toContain("ignored.txt");
    expect((await resolve()).payload.target).toEqual(snapshot);
    expect((await resolve({ mode: "chunked", target: coordinates(head, snapshot.headSha) })).state)
      .toBe(localSubject === "index" ? "below-threshold" : "scope-selected");
    expect(git(root, "rev-parse", "HEAD")).toBe(head);
    expect(await readFile(join(root, ".git/index"))).toEqual(indexBefore);
    expect(await readFile(join(root, "tracked.txt"), "utf8")).toBe("unstaged\n");
    expect(await readFile(join(root, "new.txt"), "utf8")).toBe("new\n");

    await writeFile(join(root, "tracked.txt"), "changed again\n");
    if (localSubject === "index") git(root, "add", "tracked.txt");
    const stale = await resolve({ mode: "chunked", target: coordinates(head, snapshot.headSha) }, true);
    expect(stale.error).toMatchObject({
      code: "invalid-input", message: expect.stringContaining("does not belong to the current target"),
    });
    expect((await resolve()).payload.target.headSha).not.toBe(snapshot.headSha);
  });

  it("refuses a local snapshot anchored to an old head and accepts the corrected anchor", async () => {
    const root = await repository("changeset.advisory_threshold_files: 1\n");
    const base = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "later.txt"), "later\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "later");
    const head = git(root, "rev-parse", "HEAD");
    for (const anchor of [base, head]) {
      const write = vi.fn();
      const setExitCode = vi.fn();
      await handleReviewChunkingResolve("-", {
        resolveRoot: () => root,
        readText: async () => JSON.stringify({
          schemaVersion: 1, target: coordinates(base, anchor), localSubject: "worktree",
        }),
        resolve: (request) => resolveReviewChunkingCommand(request, {
          readSettings: () => readConfigSettings(root),
          readDeliveryBinding: async () => ({ status: "authoritative-unbound" }),
          exec: createSpawnRawGitExec(root),
        }),
        write, setExitCode,
      });
      const result = JSON.parse(String(write.mock.calls[0]?.[0]));
      if (anchor === base) {
        expect(result.error).toMatchObject({ code: "invalid-input", message: expect.stringContaining("current HEAD") });
        expect(setExitCode).toHaveBeenCalledWith(1);
      } else {
        expect(result).toMatchObject({ state: "consider-chunks", payload: { target: { headSha: head } } });
        expect(setExitCode).not.toHaveBeenCalled();
      }
    }
  });

  it("short-circuits disabled configuration before Git", async () => {
    const root = await repository(
      "changeset.advisory_threshold_lines: 0\nchangeset.advisory_threshold_files: 0\n",
    );
    const head = git(root, "rev-parse", "HEAD");
    const exec = vi.fn(createSpawnRawGitExec(root));
    const result = await resolveReviewChunkingCommand(
      { schemaVersion: 1, target: target(root, head, head) },
      {
        readSettings: () => readConfigSettings(root),
        readDeliveryBinding: async () => ({ status: "authoritative-unbound" }),
        exec,
      },
    );
    expect(result.state).toBe("disabled");
    expect(exec).not.toHaveBeenCalled();
  });

  it("measures binary-only and later immutable targets through the handler", async () => {
    const root = await repository(
      "changeset.advisory_threshold_lines: 0\nchangeset.advisory_threshold_files: 1\n",
    );
    const base = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "change.bin"), Buffer.from([3, 4, 5, 6]));
    git(root, "add", ".");
    git(root, "commit", "-qm", "binary");
    const binaryHead = git(root, "rev-parse", "HEAD");
    const write = vi.fn();
    await handleReviewChunkingResolve("-", {
      resolveRoot: () => root,
      readText: async () => JSON.stringify({ schemaVersion: 1, target: coordinates(base, binaryHead) }),
      resolve: (request) => resolveReviewChunkingCommand(request, {
        readSettings: () => readConfigSettings(root),
        readDeliveryBinding: async () => ({ status: "authoritative-unbound" }),
        exec: createSpawnRawGitExec(root),
      }),
      write,
      setExitCode: vi.fn(),
    });
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      state: "consider-chunks",
      payload: { metrics: { lines: 0, files: 1 }, tripped: ["files"] },
    });

    await writeFile(join(root, "later.txt"), "later\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "later");
    const laterHead = git(root, "rev-parse", "HEAD");
    const later = await resolveReviewChunkingCommand(
      { schemaVersion: 1, target: target(root, binaryHead, laterHead) },
      {
        readSettings: () => readConfigSettings(root),
        readDeliveryBinding: async () => ({ status: "authoritative-unbound" }),
        exec: createSpawnRawGitExec(root),
      },
    );
    expect(later).toMatchObject({ payload: { metrics: { lines: 1, files: 1 } } });
  });

  it.each([
    ["malformed config", "changeset.advisory_threshold_lines: -1\n", false],
    ["missing object", "changeset.advisory_threshold_lines: 1\n", true],
  ])("emits typed failure for %s", async (_name, config, missingObject) => {
    const root = await repository(config);
    const head = git(root, "rev-parse", "HEAD");
    const inputTarget = missingObject
      ? coordinates("e".repeat(40), "f".repeat(40))
      : coordinates(head, head);
    const write = vi.fn();
    const setExitCode = vi.fn();
    await handleReviewChunkingResolve("-", {
      resolveRoot: () => root,
      readText: async () => JSON.stringify({ schemaVersion: 1, target: inputTarget }),
      resolve: (request) => resolveReviewChunkingCommand(request, {
        readSettings: () => readConfigSettings(root),
        readDeliveryBinding: async () => ({ status: "authoritative-unbound" }),
        exec: createSpawnRawGitExec(root),
      }),
      write,
      setExitCode,
    });
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      error: { code: "invalid-input" },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
