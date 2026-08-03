import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";

const roots: string[] = [];
const exec = createExecaGitExec();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-git-common-state-"));
  roots.push(root);
  await exec("git", ["init", "-b", "main", root], { cwd: root });
  return root;
}

describe("RepositoryGitCommonStatePublisher", () => {
  it("keeps delivery and review namespaces under disjoint root segments", async () => {
    const root = await repository();
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);

    await publisher.update(
      { root: "review-gate", namespace: "operations" } as never,
      "operation.json",
      () => ({ kind: "write", content: "review\n", result: undefined }) as never,
    );
    await publisher.update(
      { root: "delivery", namespace: "plans" } as never,
      "plan.json",
      () => ({ kind: "write", content: "delivery\n", result: undefined }) as never,
    );

    await expect(readFile(
      join(root, ".git", "arc", "review-gate", "operations", "operation.json"),
      "utf8",
    )).resolves.toBe("review\n");
    await expect(readFile(
      join(root, ".git", "arc", "delivery", "plans", "plan.json"),
      "utf8",
    )).resolves.toBe("delivery\n");
  });

  it.each([
    [{ root: "unknown", namespace: "plans" }, "plan.json"],
    [{ root: "delivery", namespace: "unknown" }, "plan.json"],
    [{ root: "delivery", namespace: "evidence" }, "plan.json"],
    [{ root: "review-gate", namespace: "plans" }, "plan.json"],
    [{ root: "delivery", namespace: "plans" }, "../plan.json"],
  ])("refuses an invalid address before filesystem resolution", async (location, recordName) => {
    const resolveCommon: GitExec = vi.fn(async () => ({ stdout: "/tmp/not-reached\n" }));
    const publisher = new RepositoryGitCommonStatePublisher(resolveCommon, "/tmp/repository");

    await expect(publisher.read(location as never, recordName)).rejects.toThrow();
    expect(resolveCommon).not.toHaveBeenCalled();
  });

  it("admits Markdown only in the delivery authoring namespace", async () => {
    const root = await repository();
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);

    await publisher.update(
      { root: "delivery", namespace: "authoring" },
      "starter-map.md",
      () => ({ kind: "write", content: "# Starter map\n", result: undefined }),
    );

    await expect(publisher.read(
      { root: "delivery", namespace: "authoring" },
      "starter-map.md",
    )).resolves.toBe("# Starter map\n");
    await expect(publisher.read(
      { root: "review-gate", namespace: "evidence" },
      "receipt.md",
    )).rejects.toThrow(/record name/u);
  });

  it("keeps, atomically replaces, and deletes only the addressed record", async () => {
    const root = await repository();
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);
    const location = { root: "delivery", namespace: "plans" } as const;

    await publisher.update(location, "plan.json", () => ({
      kind: "write",
      content: "first\n",
      result: undefined,
    }));
    await publisher.update(location, "other.json", () => ({
      kind: "write",
      content: "other\n",
      result: undefined,
    }));

    await expect(publisher.update(location, "plan.json", () => ({
      kind: "keep",
      result: "kept",
    }))).resolves.toBe("kept");
    await expect(publisher.read(location, "plan.json")).resolves.toBe("first\n");

    await publisher.update(location, "plan.json", () => ({
      kind: "write",
      content: "second\n",
      result: undefined,
    }));
    await expect(publisher.read(location, "plan.json")).resolves.toBe("second\n");

    await publisher.update(location, "plan.json", () => ({ kind: "delete", result: undefined }));
    await expect(publisher.read(location, "plan.json")).resolves.toBeNull();
    await expect(publisher.read(location, "other.json")).resolves.toBe("other\n");
  });

  it("makes absent deletion idempotent while propagating other removal failures", async () => {
    const root = await repository();
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);
    const location = { root: "delivery", namespace: "plans" } as const;

    await expect(publisher.update(location, "absent.json", () => ({
      kind: "delete",
      result: "absent",
    }))).resolves.toBe("absent");

    await publisher.update(location, "protected.json", () => ({
      kind: "write",
      content: "protected\n",
      result: undefined,
    }));
    const failure = Object.assign(new Error("cannot remove"), { code: "EACCES" });
    const failingPublisher = new RepositoryGitCommonStatePublisher(exec, root, async () => {
      throw failure;
    });
    await expect(failingPublisher.update(location, "protected.json", () => ({
      kind: "delete",
      result: undefined,
    }))).rejects.toBe(failure);
  });

  it("serializes concurrent updates within one namespace", async () => {
    const root = await repository();
    const publisher = new RepositoryGitCommonStatePublisher(exec, root);
    const location = { root: "delivery", namespace: "plans" } as const;
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let markFirstEntered: (() => void) | undefined;
    const firstEntered = new Promise<void>((resolve) => { markFirstEntered = resolve; });
    const holdFirst = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = publisher.update(location, "first.json", async () => {
      events.push("first-entered");
      markFirstEntered?.();
      await holdFirst;
      return { kind: "write", content: "first\n", result: undefined };
    });
    await firstEntered;
    const second = publisher.update(location, "second.json", () => {
      events.push("second-entered");
      return { kind: "write", content: "second\n", result: undefined };
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(events).toEqual(["first-entered"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual(["first-entered", "second-entered"]);
  });
});
