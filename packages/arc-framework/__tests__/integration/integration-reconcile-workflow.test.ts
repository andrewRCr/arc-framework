/** Structural contract for the current-WU checkpoint, reconcile, and merge spine. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedPattern, softWrappedProse } from "../helpers/soft-wrapped-prose.js";

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
    expect(step).toMatch(softWrappedPattern(/commit-selection[\s\S]*`commit-interlock`\s+release[\s\S]*`push-interlock`\s+release/iu));
    expect(step).toMatch(softWrappedPattern(/exact-replay\s+\/\s+continue[\s\S]*already\s+durable[\s\S]*restart/iu));
    expect(step).toMatch(softWrappedPattern(/machine-proved\s+`applicable`[\s\S]*no\s+attended\s+step/iu));
    expect(step).toMatch(softWrappedPattern(/explicit\s+`changed`[\s\S]*ordinary\s+scope\s+selection/iu));
  });

  it.each(WORKFLOWS)("rebinds stale terminal state through ordinary delivery reconciliation in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 10) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 11) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);

    expect(step).toContain("`terminal-rebind-required / reconcile-delivery-state`");
    expect(step).toContain("`remedy.argv`");
    expect(step).toContain("`remedy.stdin`");
    expect(step).toMatch(softWrappedProse("adds no new operation"));
    expect(step).toContain("`rebound / rerun-checkpoint`");
    expect(step).not.toMatch(softWrappedPattern(/terminal(?:(?!\r?\n[ \t]*(?:>[ \t]*)?\r?\n)[\s\S])*recovery\s+operation/iu));
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
    expect(step).toMatch(softWrappedPattern(/resume-pre-publication[\s\S]*`publication-pending`\s+or\s+`hosted-review-pending`\s+locus\s+keeps\s+publication[\s\S]*shared\s+publication-boundary\s+commit/u));
    expect(step).toContain("arc publish {name} --json");
    expect(step).toMatch(softWrappedPattern(/already-open\s+Step\s+2\s+review[\s\S]*restart\s+this\s+step/iu));
  });

  it.each(WORKFLOWS)("commits a renewed shipped delivery boundary without private review replay in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 10) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 11) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);

    expect(step).toContain("`candidate-publication-required / refresh-shipped-delivery`");
    expect(step).toContain("`candidate-publication-commit-required / commit-boundary`");
    expect(step).toMatch(softWrappedPattern(/refresh-shipped-delivery[\s\S]*payload\.attestArgv[\s\S]*restart\s+this\s+step/iu));
    expect(step).toMatch(softWrappedPattern(/commit-boundary[\s\S]*refresh\s+publication\s+boundary[\s\S]*restart\s+this\s+step/iu));
    expect(step).toMatch(softWrappedPattern(/refresh-shipped-delivery[\s\S]*does\s+not\s+enter\s+private\s+pre-publication\s+review/iu));
  });

  it.each(WORKFLOWS)("orders typed procedures around the final integration interlock in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 10) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 11) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);
    const orderedSurfaces = [
      "arc wu reconcile {name} --apply --json",
      "arc integrate checkpoint {name}",
      "checkpoint's supplied `remedy.argv` unchanged",
      "payload.interlockSurface.machineEvidence.text",
      "`integration-interlock`:",
      "arc integrate merge {name} --checkpoint {payload.checkpointHandle}",
    ];

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    let previous = -1;
    for (const surface of orderedSurfaces) {
      const current = step.indexOf(surface);
      expect(current, surface).toBeGreaterThan(previous);
      previous = current;
    }

    expect(step.match(softWrappedPattern(/`push-interlock`\s+release/gu))).toHaveLength(4);
    expect(step.match(softWrappedPattern(/`commit-interlock`\s+release/gu))).toHaveLength(3);
    const flatStep = step.replace(/\s+/gu, " ");
    const skippedClean = flatStep.indexOf("`skipped-clean / continue-reconcile` restarts this step without a push");
    const mergedOnly = flatStep.indexOf("`merged / run-quality-gates`");
    const exactChecks = flatStep.indexOf("arc check new-head --from <pre-merge head>", mergedOnly);
    const basePush = flatStep.indexOf("`push-interlock` release", exactChecks);
    const postMergeRerun = flatStep.indexOf("Restart this step", basePush);
    expect(skippedClean).toBeGreaterThan(-1);
    expect(mergedOnly).toBeGreaterThan(skippedClean);
    expect(exactChecks).toBeGreaterThan(mergedOnly);
    expect(basePush).toBeGreaterThan(exactChecks);
    expect(postMergeRerun).toBeGreaterThan(basePush);
    expect(flatStep.slice(mergedOnly, postMergeRerun)).not.toContain("review-applicability judgment");
    expect(flatStep.slice(mergedOnly, postMergeRerun)).not.toContain("arc review status");
    expect(step).toMatch(softWrappedPattern(/`pending`[\s\S]*requires\s+direction/u));

    expect(flatStep).toContain("No checkpoint approval carries across the overlapping base-merge arm");
    expect(flatStep).toContain("review carries across it only as the typed applicability result decides");
    for (const invariant of [
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
