import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
