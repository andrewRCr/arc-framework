import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, it, expect, afterEach } from "vitest";

import { composeProjectReadinessView } from "../../../src/lib/status/project-view.js";

let root: string | undefined;

async function writeMeta(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function meta(slug: string, state: string, fields: { owner?: string; priority?: string; cohort?: string; dependsOn?: string } = {}): string {
  const owner = fields.owner ?? "andrew";
  const priority = fields.priority ?? "P3";
  const cohort = fields.cohort ?? "[none]";
  const dependsOn = fields.dependsOn ?? "[none]";
  return [
    `# Metadata: ${slug}`,
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    `| \`${state}\` | \`${owner}\` | [none] | \`Heavy\` | \`${priority}\` |`,
    "",
    `- **Cohort:** ${cohort}`,
    `- **Depends On:** ${dependsOn}`,
    "",
    "---",
    "",
  ].join("\n");
}

describe("composeProjectReadinessView", () => {
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("renders active, ready, and blocked tiers deterministically from meta files", async () => {
    root = await mkdtemp(join(tmpdir(), "arc-project-view-"));
    await writeMeta(
      join(root, ".arc", "active", "meta-active-alpha.md"),
      meta("active-alpha", "Active", { priority: "P1", cohort: "agile-parallelism" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "ready-beta", "meta-ready-beta.md"),
      meta("ready-beta", "Planning", { priority: "P2" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "blocked-gamma", "meta-blocked-gamma.md"),
      meta("blocked-gamma", "Planning", { dependsOn: "`ready-beta`" }),
    );
    await writeMeta(
      join(root, ".arc", "backlog", "planned", "blocked-delta", "meta-blocked-delta.md"),
      meta("blocked-delta", "Planning", { dependsOn: "`blocked-gamma`" }),
    );

    const view = await composeProjectReadinessView({
      cwd: root,
      renderedRef: "abc1234",
      title: "Roadmap: Test Project",
    });

    expect(view).toContain("# Roadmap: Test Project");
    expect(view).toContain("Last rendered against `abc1234`");
    expect(view).toContain("| `Active` | active-alpha | P1");
    expect(view).toContain("## Ready");
    expect(view).toContain("| ready-beta | P2");
    expect(view).toContain("## Blocked");
    expect(view).toContain("### Depth 1");
    expect(view).toContain("| blocked-gamma | P3");
    expect(view).toContain("ready-beta");
    expect(view).toContain("### Depth 2");
    expect(view).toContain("| blocked-delta | P3");
    expect(view).toContain("blocked-gamma");
  });
});
