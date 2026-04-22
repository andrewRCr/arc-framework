/**
 * Integration tests for the extensions-status probe.
 *
 * Builds a synthetic `.arc/system/{extensions,workflows}/` tree in a temp
 * directory and exercises the real `runExtensionsStatus` /
 * `runExtensionsSessionInitStatus` against it — covering active/inactive
 * classification, orphan detection, malformed-frontmatter warnings, and
 * session-init narrowing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  runExtensionsSessionInitStatus,
  runExtensionsStatus,
} from "../../src/commands/extensions.js";

interface Fixture {
  root: string;
  extDir: string;
  wfDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "arc-extensions-"));
  const extDir = join(root, ".arc", "system", "extensions");
  const wfDir = join(root, ".arc", "system", "workflows");
  await mkdir(extDir, { recursive: true });
  await mkdir(wfDir, { recursive: true });
  return { root, extDir, wfDir };
}

function extensionFile(name: string, active: boolean, description = "desc"): string {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    `active: ${active ? "true" : "false"}`,
    "---",
    "",
    `# Extension: ${name}`,
    "",
  ].join("\n");
}

async function writeExtension(
  extDir: string,
  name: string,
  active: boolean,
  description = "desc",
): Promise<void> {
  await writeFile(join(extDir, `${name}.md`), extensionFile(name, active, description));
}

async function writeWorkflow(
  wfDir: string,
  relPath: string,
  extensionRefs: string[],
): Promise<void> {
  const body = [
    "---",
    "purpose: fixture",
    "audience: agent",
    "---",
    "",
    "# Fixture workflow",
    "",
    ...extensionRefs.map((name, i) => `${i + 1}. Step · \`#${name}\``),
    "",
  ].join("\n");
  const full = join(wfDir, relPath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, body);
}

describe("runExtensionsStatus — full mode", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("classifies active and inactive extensions and counts them", async () => {
    await writeExtension(fixture.extDir, "pre-merge-review", true, "Review ceremony");
    await writeExtension(fixture.extDir, "post-task-quality", false, "Extra checks");
    await writeExtension(fixture.extDir, "post-unit-quality", false);
    await writeWorkflow(fixture.wfDir, "a.md", ["pre-merge-review"]);

    const result = await runExtensionsStatus({ cwd: fixture.root });

    expect(result.mode).toBe("full");
    expect(result.activeCount).toBe(1);
    expect(result.inactiveCount).toBe(2);
    expect(result.extensions).toEqual(
      expect.arrayContaining([
        { name: "pre-merge-review", active: true, description: "Review ceremony" },
        { name: "post-task-quality", active: false, description: "Extra checks" },
      ]),
    );
  });

  it("detects orphaned references against the extensions listing", async () => {
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await writeWorkflow(fixture.wfDir, "wf.md", ["pre-merge-review", "ghost-extension"]);

    const result = await runExtensionsStatus({ cwd: fixture.root, includeOrphanDetails: true });

    expect(result.orphanCount).toBe(1);
    expect(result.orphans).toEqual([
      expect.objectContaining({ extensionName: "ghost-extension", workflowPath: "wf.md" }),
    ]);
  });

  it("reports orphan count but suppresses detail when includeOrphanDetails is false", async () => {
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await writeWorkflow(fixture.wfDir, "wf.md", ["ghost"]);

    const result = await runExtensionsStatus({ cwd: fixture.root });

    expect(result.orphanCount).toBe(1);
    expect(result.orphans).toEqual([]);
    expect(result.includeOrphanDetails).toBe(false);
  });

  it("ignores README.md in the extensions directory", async () => {
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await writeFile(join(fixture.extDir, "README.md"), "# Extensions directory\n");

    const result = await runExtensionsStatus({ cwd: fixture.root });

    expect(result.extensions.map((e) => e.name)).toEqual(["pre-merge-review"]);
  });

  it("records a warning when an extension file has malformed frontmatter and still resolves refs by basename", async () => {
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await writeFile(
      join(fixture.extDir, "broken.md"),
      "# no frontmatter\n",
    );
    await writeWorkflow(fixture.wfDir, "wf.md", ["broken"]);

    const result = await runExtensionsStatus({ cwd: fixture.root });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("broken.md");
    // Even with malformed frontmatter, a workflow reference to `broken`
    // should resolve against the filename — otherwise every parse error
    // would cascade into orphan noise.
    expect(result.orphanCount).toBe(0);
  });

  it("recurses into workflow subdirectories", async () => {
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await writeWorkflow(fixture.wfDir, "sub/nested.md", ["pre-merge-review", "ghost"]);

    const result = await runExtensionsStatus({ cwd: fixture.root, includeOrphanDetails: true });

    expect(result.orphans).toEqual([
      expect.objectContaining({ workflowPath: "sub/nested.md", extensionName: "ghost" }),
    ]);
  });

  it("handles empty fixture trees without throwing", async () => {
    const result = await runExtensionsStatus({ cwd: fixture.root });
    expect(result.extensions).toEqual([]);
    expect(result.activeCount).toBe(0);
    expect(result.orphanCount).toBe(0);
  });
});

describe("runExtensionsSessionInitStatus — session-init mode", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  it("returns only active extensions, not inactive ones", async () => {
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    await writeExtension(fixture.extDir, "post-task-quality", false);
    await writeExtension(fixture.extDir, "post-context-load", true);

    const result = await runExtensionsSessionInitStatus({ cwd: fixture.root });

    expect(result.mode).toBe("session-init");
    expect(result.active.sort()).toEqual(["post-context-load", "pre-merge-review"]);
  });

  it("returns an empty list when no extensions are active", async () => {
    await writeExtension(fixture.extDir, "post-task-quality", false);
    const result = await runExtensionsSessionInitStatus({ cwd: fixture.root });
    expect(result.active).toEqual([]);
  });

  it("does not walk the workflows directory (fast path)", async () => {
    // The session-init probe should succeed even when the workflows
    // directory is empty — it only reads the extensions directory.
    await writeExtension(fixture.extDir, "pre-merge-review", true);
    const result = await runExtensionsSessionInitStatus({ cwd: fixture.root });
    expect(result.active).toEqual(["pre-merge-review"]);
  });
});
