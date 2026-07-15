/** Integration tests for the filesystem-backed commit artifact resolver. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFilesystemArtifactResolver } from "../../src/lib/commit-check/index.js";

describe("createFilesystemArtifactResolver", () => {
  let root: string;
  let arcRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "arc-artifact-resolver-"));
    arcRoot = join(root, ".arc");
    await mkdir(arcRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    ["tasks", "active", "tasks-example.md"],
    ["design", "active", "spec-example.md"],
    ["design", "backlog/nested", "draft-example.md"],
    ["meta", "active", "meta-example.md"],
    ["meta", "completed/2026/example", "meta-example.md"],
  ] as const)("finds %s artifacts in %s", async (family, directory, filename) => {
    const target = join(arcRoot, directory);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, filename), "fixture");

    const resolveArtifact = createFilesystemArtifactResolver(arcRoot);

    await expect(resolveArtifact({ family, filename })).resolves.toBe("found");
  });

  it.each([
    ["tasks", "backlog/tasks-example.md"],
    ["tasks", "completed/tasks-example.md"],
    ["design", "completed/spec-example.md"],
    ["meta", "backlog/meta-example.md"],
  ] as const)("does not search misplaced %s artifact %s", async (family, relativePath) => {
    const target = join(arcRoot, relativePath);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, "fixture");

    const resolveArtifact = createFilesystemArtifactResolver(arcRoot);

    await expect(
      resolveArtifact({ family, filename: relativePath.split("/").at(-1) ?? "" }),
    ).resolves.toBe("not-found");
  });

  it("does not resolve task artifacts nested beneath active", async () => {
    await mkdir(join(arcRoot, "active", "nested"), { recursive: true });
    await writeFile(join(arcRoot, "active", "nested", "tasks-example.md"), "fixture");

    const resolveArtifact = createFilesystemArtifactResolver(arcRoot);

    await expect(
      resolveArtifact({ family: "tasks", filename: "tasks-example.md" }),
    ).resolves.toBe("not-found");
  });

  it("returns found when a later root matches after an unavailable root", async () => {
    await writeFile(join(arcRoot, "active"), "not a directory");
    await mkdir(join(arcRoot, "backlog", "nested"), { recursive: true });
    await writeFile(join(arcRoot, "backlog", "nested", "spec-example.md"), "fixture");

    const resolveArtifact = createFilesystemArtifactResolver(arcRoot);

    await expect(
      resolveArtifact({ family: "design", filename: "spec-example.md" }),
    ).resolves.toBe("found");
  });

  it("returns unresolvable when any required root is unavailable and none match", async () => {
    await writeFile(join(arcRoot, "active"), "not a directory");
    await mkdir(join(arcRoot, "backlog"));

    const resolveArtifact = createFilesystemArtifactResolver(arcRoot);

    await expect(
      resolveArtifact({ family: "design", filename: "spec-example.md" }),
    ).resolves.toBe("unresolvable");
  });

  it("treats absent family roots beneath an available .arc layout as empty", async () => {
    const resolveArtifact = createFilesystemArtifactResolver(arcRoot);

    await expect(
      resolveArtifact({ family: "meta", filename: "meta-example.md" }),
    ).resolves.toBe("not-found");
  });

  it("returns unresolvable when the .arc substrate is unavailable", async () => {
    const resolveArtifact = createFilesystemArtifactResolver(join(root, "missing-arc"));

    await expect(
      resolveArtifact({ family: "tasks", filename: "tasks-example.md" }),
    ).resolves.toBe("unresolvable");
  });
});
