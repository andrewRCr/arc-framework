import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildConfigMap } from "../../src/lib/config/index.js";
import { resolveFileList } from "../../src/lib/classification.js";
import type { Recipe } from "../../src/lib/types.js";

const root = resolve(import.meta.dirname, "../../../..");
const packageArc = resolve(root, "packages/arc-framework/arc");
const projectArc = resolve(root, ".arc");

async function readPackage(path: string): Promise<string> {
  return readFile(resolve(packageArc, path), "utf8");
}

async function readProject(path: string): Promise<string> {
  return readFile(resolve(projectArc, path), "utf8");
}

describe("locus methodology contracts", () => {
  it("publishes the complete D1 locus and transient command surface", async () => {
    const references = await Promise.all([
      readPackage("reference/QUICK-REFERENCE.template.md"),
      readProject("reference/QUICK-REFERENCE.md"),
    ]);
    const requiredCommands = [
      "arc locus [--json]",
      "arc start [name] [--new] [--here] [--from <pointer-or-blurb>]",
      "arc resume [slug] [--here]",
      "arc plan check",
      "arc errand open <slug> [--intent <text>] [--from-inbox <entry>]",
      "arc errand link <slug> (--from-inbox <entry> | --inbox-title-file <path|->) [--json]",
      "arc errand close <slug> [--force] [--json]",
      "arc errand abandon <slug> [--json]",
      "arc errand promote <slug>",
      "arc housekeep check",
      "arc housekeep mark-execute <titles...> [--json]",
    ];

    for (const reference of references) {
      for (const command of requiredCommands) expect(reference).toContain(command);
    }
  });

  it("keeps frame selection reader-owned across init, recovery, and handoff", async () => {
    for (const base of [packageArc, projectArc]) {
      const suffix = base === packageArc ? ".template.md" : ".md";
      const init = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-init${suffix}`),
        "utf8",
      );
      const handoff = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-handoff${suffix}`),
        "utf8",
      );
      const recovery = await readFile(
        resolve(base, "system/workflows/arc/session-lifecycle/session-recover.md"),
        "utf8",
      );

      expect(init).toContain("locusState: Probe<LocusStateV1>");
      expect(init).toContain("Dispatch only on `locusState.value.current`");
      expect(init).toContain("exact role row registered at the entering checkout");
      expect(init).toContain("`current.kind === \"none\"` → attach nothing");
      expect(init).toContain("a null lease is the normal ordinary-session state");
      expect(init).toContain("select a second frame from branch shape, metas, the worktree list, or SESSION-NOTES");
      expect(handoff).toContain("dispatch only on `handoffLocus.value`");
      expect(handoff).toContain("Never select the handoff subject from a branch prefix");
      expect(handoff).toContain("`release-work-unit` with null `leaseId` — release nothing");
      expect(recovery).toContain("required `recover.locusState` is the sole topology/frame read");
      expect(recovery).toContain("dispatching only on `report.recover.recoveryFrame.value`");
    }
  });

  it("keeps planning and routing on their unclaimed write-context paths", async () => {
    for (const base of [packageArc, projectArc]) {
      const planSkill = await readFile(
        resolve(base, "system/.internal/skills/arc-plan/SKILL.md"),
        "utf8",
      );
      const planWorkflow = await readFile(resolve(base, "system/workflows/arc/draft-design.md"), "utf8");
      const housekeepWorkflow = await readFile(
        resolve(base, "system/workflows/arc/supplemental/drain-inbox.md"),
        "utf8",
      );
      expect(planSkill).toContain("An optional positional argument supplies the starting point");
      expect(planWorkflow).toContain("arc plan check --name <slug> --json");
      expect(housekeepWorkflow).toContain("arc housekeep check --json");
      expect(`${planSkill}\n${planWorkflow}\n${housekeepWorkflow}`).not.toMatch(
        /arc (?:plan|housekeep) (?:open|close|abandon)/u,
      );
    }
  });

  it("documents the trimmed housekeep and session-guidance contracts", async () => {
    for (const base of [packageArc, projectArc]) {
      const probe = await readFile(
        resolve(base, "system/workflows/arc/session-lifecycle/session-init/probe-envelope.md"),
        "utf8",
      );
      const housekeepSkill = await readFile(
        resolve(base, "system/.internal/skills/arc-housekeep/SKILL.md"),
        "utf8",
      );
      const workOrganization = await readFile(
        resolve(base, "reference/strategies/arc/strategy-work-organization.md"),
        "utf8",
      );
      const suffix = base === packageArc ? ".template.md" : ".md";
      const sessionInit = await readFile(
        resolve(base, `system/workflows/arc/session-lifecycle/session-init${suffix}`),
        "utf8",
      );
      const runErrand = await readFile(
        resolve(base, "system/workflows/arc/supplemental/run-errand.md"),
        "utf8",
      );

      expect(probe).toContain("`currentFrame?`, `primaryAvailability?`, `recovery?`, and `reconciliation?`");
      expect(probe).toContain("`pendingExecuteBound[]`");
      expect(housekeepSkill).toContain("base-branch");
      expect(housekeepSkill).not.toContain("arc housekeep open");
      expect(housekeepSkill).not.toMatch(/arc housekeep plan|strictest lane|plan digest/iu);
      expect(workOrganization).toContain("One PR per lane");
      expect(workOrganization).not.toMatch(/lane is derived at close|strictest lane/iu);
      expect(sessionInit).toContain("`inboxState.value.pendingExecuteBound` non-empty");
      expect(sessionInit).not.toContain("inbox dispatch groups");
      expect(runErrand).toContain("Do not invoke\n     `arc errand open` again");
      expect(runErrand).toContain("`arc locus resolve <record-id> --action resume`");
    }
  });

  it("keeps package and project references aligned at locus decision sites", async () => {
    for (const path of [
      "reference/briefs/AGENT-BRIEF.ARC.md",
      "reference/strategies/arc/strategy-concurrent-work.md",
      "reference/strategies/arc/strategy-work-organization.md",
      "system/.internal/skills/arc-errand/SKILL.md",
      "system/.internal/skills/arc-housekeep/SKILL.md",
      "system/.internal/skills/arc-plan/SKILL.md",
      "system/.internal/skills/arc-session/SKILL.md",
    ]) {
      expect(await readProject(path), path).toBe(await readPackage(path));
    }
  });

  it("resolves the referenced concurrency strategy and inbox workflow from the install recipe", async () => {
    const recipe = JSON.parse(
      await readFile(resolve(root, "packages/arc-framework/init-recipe.json"), "utf8"),
    ) as Recipe;
    const files = resolveFileList(
      recipe,
      buildConfigMap({ pm_mode: "none", tools: [], team_mode: false }),
    );

    expect(files).toContain("reference/strategies/arc/strategy-concurrent-work.md");
    expect(files).toContain("system/workflows/arc/supplemental/drain-inbox.md");
  });
});
