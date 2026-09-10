/** Structural contract for the current-WU checkpoint, reconcile, and merge spine. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const WORKFLOWS = [
  join(
    ROOT,
    "packages",
    "arc-framework",
    "arc",
    "system",
    "workflows",
    "arc",
    "work-unit-lifecycle",
    "integrate-work-unit.md",
  ),
  join(ROOT, ".arc", "system", "workflows", "arc", "work-unit-lifecycle", "integrate-work-unit.md"),
];

describe("integration current-WU reconcile workflow", () => {
  it.each(WORKFLOWS)("routes Candidate applicability through typed checkpoint results in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 10) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 11) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);

    expect(step).toContain("`candidate-applicability / rerun-checkpoint`");
    expect(step).toContain("`candidate-applicability / request-authority`");
    expect(step).toContain("payload.selectionOfferText");
    expect(step).toContain("payload.recommendedActionText");
    expect(step).toContain("payload.selectionPromptText");
    expect(step).toContain("payload.resolutionSelector");
    expect(step).toContain("arc candidate applicability resolve {name} -");
    expect(step).toContain("`resolved / commit-selection`");
    expect(step).toContain("`exact-replay / commit-selection`");
    expect(step).toMatch(/commit-selection[\s\S]*`commit-interlock` release[\s\S]*`push-interlock` release/iu);
    expect(step).toMatch(/exact-replay \/ continue[\s\S]*already durable[\s\S]*restart/iu);
    expect(step).toMatch(/machine-proved `applicable`[\s\S]*no attended step/iu);
    expect(step).toMatch(/explicit `changed`[\s\S]*ordinary scope selection/iu);
  });

  it.each(WORKFLOWS)("rebinds stale terminal state through ordinary delivery reconciliation in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 10) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 11) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);

    expect(step).toContain("`terminal-rebind-required / reconcile-delivery-state`");
    expect(step).toContain("payload.reconcileInput");
    expect(step).toContain("arc delivery reconcile - --json");
    expect(step).toContain("`rebound / rerun-checkpoint`");
    expect(step).not.toMatch(/terminal[^\n]*recovery operation/iu);
  });

  it.each(WORKFLOWS)("resumes ordinary publication settlement for a newly recognized Candidate in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 10) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 11) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);

    expect(step).toContain("`candidate-publication-required / resume-pre-publication`");
    expect(step).toContain("payload.attestArgv");
    expect(step).toContain("payload.recommendedActionText");
    expect(step).toMatch(/ordinary\s+pre-publication/u);
    expect(step).toContain("arc publish {name} --json");
    expect(step).toMatch(/already-open Step 2 review[\s\S]*restart this step/iu);
  });

  it.each(WORKFLOWS)("orders typed procedures around the final integration interlock in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 10) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 11) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);
    const orderedSurfaces = [
      "arc wu reconcile {name} --apply --json",
      "arc integrate checkpoint {name} --json",
      "arc base merge --expected-base {payload.observation.feasibility.base} --expected-head {payload.candidateHead} --json",
      "payload.interlockSurface.machineEvidence.text",
      "**Extension report** · `#pre-merge`",
      "`integration-interlock`:",
      "arc integrate merge {name} --checkpoint {payload.checkpointHandle} --json",
    ];

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    let previous = -1;
    for (const surface of orderedSurfaces) {
      const current = step.indexOf(surface);
      expect(current, surface).toBeGreaterThan(previous);
      previous = current;
    }

    expect(step.match(/repeat the Step 1 push extension contract/giu)).toHaveLength(4);
    expect(step.match(/`push-interlock` release/gu)).toHaveLength(4);
    expect(step.match(/`commit-interlock` release/gu)).toHaveLength(3);
    const flatStep = step.replace(/\s+/gu, " ");
    const skippedClean = flatStep.indexOf("`skipped-clean / continue-reconcile` restarts this step without a push");
    const mergedOnly = flatStep.indexOf("`merged / run-quality-gates`");
    const exactChecks = flatStep.indexOf("Tier 1 over the exact merged head", mergedOnly);
    const basePush = flatStep.indexOf("`push-interlock` release", exactChecks);
    const postMergeRerun = flatStep.indexOf("Restart this step", basePush);
    expect(skippedClean).toBeGreaterThan(-1);
    expect(mergedOnly).toBeGreaterThan(skippedClean);
    expect(exactChecks).toBeGreaterThan(mergedOnly);
    expect(basePush).toBeGreaterThan(exactChecks);
    expect(postMergeRerun).toBeGreaterThan(basePush);
    expect(flatStep.slice(mergedOnly, postMergeRerun)).not.toContain("review-applicability judgment");
    expect(flatStep.slice(mergedOnly, postMergeRerun)).not.toContain("arc review status");
    expect(step).toMatch(/`pending`[\s\S]*requires direction/u);

    for (const invariant of [
      "Clearance never carries.",
      "Advisory receipts are not merge authority.",
      "The integration interlock is the sole merge authority.",
    ]) {
      expect(step.split(invariant)).toHaveLength(2);
    }

    for (const retiredMechanic of [
      "arc base drift --json",
      "git merge --no-edit",
      "arc status {name} --json",
      "arc merge lock release -",
      "gh pr merge",
    ]) {
      expect(step).not.toContain(retiredMechanic);
    }
  });
});
