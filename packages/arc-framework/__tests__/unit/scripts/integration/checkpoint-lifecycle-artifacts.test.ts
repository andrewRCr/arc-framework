/** Lifecycle-artifact verification on the checkpoint's own composition path. */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createIntegrationCheckpointDependencies } from "../../../../src/scripts/integration/checkpoint-composition.js";
import { lifecycleArtifactFacts } from "../../../../src/scripts/review-gate/readiness.js";

const META_PATH = ".arc/active/meta-example.md";

const roots: string[] = [];

async function treeWithMeta(meta: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-checkpoint-artifacts-"));
  roots.push(root);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "archive.cadence: manual\n", "utf8");
  await writeFile(join(root, META_PATH), meta, "utf8");
  return root;
}

function meta(sections: string, state = "Integrating", branch = "feat/example"): string {
  return [
    "# Metadata: example",
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| \`${state}\` | \`dev\` | \`${branch}\` | \`Light\` | \`P2\` |`,
    "",
    "- **Task List:** [none]",
    "",
    sections,
  ].join("\n");
}

const COMPLETION_NOTES = ["## Completion Notes", "", "Delivered the example work unit.", ""].join("\n");

function readLifecycle(root: string): Promise<{ complete: boolean; artifactFacts: { code: string }[] }> {
  const dependencies = createIntegrationCheckpointDependencies({
    cwd: root,
    exec: async () => {
      throw new Error("the lifecycle read must not shell out");
    },
  });
  return dependencies.readLifecycle("example");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("lifecycleArtifactFacts", () => {
  it("requires Completion Notes", () => {
    expect(lifecycleArtifactFacts(meta(""), META_PATH))
      .toEqual([expect.objectContaining({ code: "missing-completion-notes", path: META_PATH })]);
  });

  it("accepts a work unit whose Release Notes Entry is absent", () => {
    expect(lifecycleArtifactFacts(meta(COMPLETION_NOTES), META_PATH)).toEqual([]);
  });

  it("rejects a Release Notes Entry with no categorized changes", () => {
    const content = meta([COMPLETION_NOTES, "## Release Notes Entry", "", "A summary with no categories.", ""]
      .join("\n"));

    expect(lifecycleArtifactFacts(content, META_PATH))
      .toEqual([expect.objectContaining({ code: "malformed-release-notes" })]);
  });
});

describe("checkpoint lifecycle composition", () => {
  it("withholds completeness from a work unit missing Completion Notes", async () => {
    const summary = await readLifecycle(await treeWithMeta(meta("")));

    expect(summary.complete).toBe(false);
    expect(summary.artifactFacts).toEqual([
      expect.objectContaining({ code: "missing-completion-notes", path: META_PATH }),
    ]);
  });

  it("completes a positioned work unit whose artifacts are satisfied", async () => {
    const summary = await readLifecycle(await treeWithMeta(meta(COMPLETION_NOTES)));

    expect(summary.artifactFacts).toEqual([]);
    expect(summary.complete).toBe(true);
  });

  it("reads the archived meta under the default with-integration cadence", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-checkpoint-artifacts-"));
    roots.push(root);
    const archived = ".arc/completed/2026-Q3/01_example/meta-example.md";
    await mkdir(join(root, ".arc", "completed", "2026-Q3", "01_example"), { recursive: true });
    await writeFile(join(root, archived), meta("", "Shipped", "[none]"), "utf8");

    const summary = await readLifecycle(root);

    expect(summary.complete).toBe(false);
    expect(summary.artifactFacts).toEqual([
      expect.objectContaining({ code: "missing-completion-notes", path: archived }),
    ]);
  });

  it("withholds completeness when the Release Notes Entry is malformed", async () => {
    const content = meta([COMPLETION_NOTES, "## Release Notes Entry", "", "Summary only.", ""].join("\n"));
    const summary = await readLifecycle(await treeWithMeta(content));

    expect(summary.complete).toBe(false);
    expect(summary.artifactFacts).toEqual([expect.objectContaining({ code: "malformed-release-notes" })]);
  });
});
