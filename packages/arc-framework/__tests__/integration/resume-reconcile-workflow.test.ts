/**
 * Contract coverage for resume's reconcile step.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedPattern, softWrappedProse } from "../helpers/soft-wrapped-prose.js";
import { expectLifecycleResult, lifecycleRepository, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";

const root = resolve(import.meta.dirname, "../../../..");

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

describe("resume current-WU reconcile ceremony", () => {
  it("shows the target's recorded pause reason at the resume precondition", async () => {
    const h = await lifecycleRepository();
    const slug = "survey";
    const reason = "Waiting for field notes";
    await seedWorkUnit(h.repo, slug, { identity: LIFECYCLE_IDENTITY, meta: { state: "Planning", currentWorkflow: "draft-design" } });
    expectLifecycleResult(await h.run(["pause", slug, "--reason", reason]), 0, /paused/iu);
    const meta = await h.run(["view", "meta", "--for", slug]);
    expect(meta.exitCode, meta.output).toBe(0);
    expect(meta.output).toContain(reason);

    const workflow = await readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md");
    const gate = workflow.split("### 1)")[1]?.split("### 2)")[0] ?? "";
    const output: string[] = [];
    for (const [, command] of gate.matchAll(/^arc ([^`#\r\n]+)/gmu)) {
      const args = command!.trim().replaceAll("{name}", slug).split(/\s+/u);
      const result = await h.run(args);
      expect(result.exitCode, result.output).toBe(0);
      output.push(result.output);
    }
    expect(output.join("\n")).toContain(reason);
  }, LIFECYCLE_TIMEOUT_MS);

  it("reconciles from the work unit's own checkout after the pause clears, committing nothing", async () => {
    const [packaged, installed] = await Promise.all([
      readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"),
      readRepositoryFile(".arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md"),
    ]);

    expect(installed).toBe(packaged);
    const materialize = packaged.indexOf("arc materialize {name}");
    const resume = packaged.indexOf("arc resume {name}\n");
    const reconcile = packaged.indexOf("arc wu reconcile {name} --apply --json");

    expect(materialize).toBeGreaterThanOrEqual(0);
    expect(resume).toBeGreaterThan(materialize);
    expect(reconcile).toBeGreaterThan(resume);
    expect(packaged).toMatch(softWrappedPattern(/fresh\s+worktree\s+reported\s+by\s+`arc materialize`[\s\S]*arc wu reconcile/u));
    expect(packaged).not.toContain("--attach-session");
    expect(packaged).not.toContain("chore(arc): resume {name}");
    expect(packaged).not.toContain("chore(arc): reconcile {name} after resume");
    expect(packaged).toMatch(softWrappedProse("`clean` — continue without a write, stage, or commit."));
    expect(packaged).toMatch(softWrappedPattern(/`conflict`[\s\S]*pause\s+is\s+already\s+cleared/u));
  });

  it("checks for outstanding findings before resuming work after an applied repair", async () => {
    const workflow = await readRepositoryFile("packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/resume-work-unit.md");
    const applied = workflow.match(/^- `applied`[^\n]*(?:\n[ \t]+[^\n]*)*/mu)?.[0] ?? "";
    const rerunsReconcile = /\b(?:re-?run|repeat|recheck)\b/iu.test(applied);
    const gatesOnFindings = /\badvisor(?:y|ies)\b/iu.test(applied) && /\bheld\b/iu.test(applied)
      && /\b(?:stop|unless|only|before|pending|if|until)\b/iu.test(applied);

    expect(rerunsReconcile || gatesOnFindings, `Expected a reconcile rerun or a gate on advisories and held edges. Received: ${applied}`).toBe(true);
  });
});
