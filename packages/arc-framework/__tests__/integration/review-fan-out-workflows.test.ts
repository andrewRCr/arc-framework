/** Shipped workflow contracts for typed hosted-review fan-out. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const paths = {
  delivery: [
    "packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md",
    ".arc/system/workflows/arc/supplemental/deliver-stack.md",
  ],
  integration: [
    "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
    ".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
  ],
} as const;

async function copies(kind: keyof typeof paths): Promise<readonly [string, string]> {
  const [packaged, project] = await Promise.all(paths[kind].map((path) => readFile(resolve(ROOT, path), "utf8")));
  return [packaged!, project!];
}

function reviewSection(workflow: string, start: string, end: string): string {
  const startIndex = workflow.indexOf(start);
  const endIndex = workflow.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return workflow.slice(startIndex, endIndex);
}

function expectTypedProgression(section: string): void {
  const commands = [
    "arc review status",
    "arc review hosted request -",
    "arc review hosted await -",
    "arc review hosted settle -",
  ];
  const positions = commands.map((command) => section.indexOf(command));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
  expect(section).toContain("Dispatch only on `nextAction`");
  expect(section).toContain("review-hosted-request");
  expect(section).toMatch(
    /obtain-ceiling-override[\s\S]*exact `consequence`[\s\S]*stops? without requesting[\s\S]*explicit approval[\s\S]*--ceiling-override/iu,
  );
  expect(section).toContain("resolve-review-applicability");
  expect(section).toContain("arc candidate applicability resolve");
  expect(section).toContain("pass the returned action unchanged");
  expect(section).toMatch(/pass the returned self-contained handle|re-invoke the same handle/iu);
  expect(section).toMatch(/returned settlement plan|payload\.hostedSettlementPlan/iu);
  expect(section).toContain("typed discharge conjunction");
  expect(section).not.toMatch(
    /for each (?:retained )?member|enumerate (?:the )?members|priorAttemptId|priorHead|currentHead|priorBase|currentBase|projectionDigest|residualDigest/iu,
  );
  expect(section).not.toMatch(/arc review (?:delivery|fan-?out|member)\b/iu);
}

describe("hosted review fan-out workflow", () => {
  it("keeps package/project parity and typed progression in the delivery workflow", async () => {
    const [packaged, project] = await copies("delivery");
    expect(project).toBe(packaged);
    const section = reviewSection(
      packaged,
      "## Review and land the current member",
      "## Terminal handoff",
    );
    expectTypedProgression(section);
    expect(section.indexOf("arc delivery land prepare - --json"))
      .toBeGreaterThan(section.indexOf("arc review status"));
    expect(section.indexOf("arc delivery land apply - --json"))
      .toBeGreaterThan(section.indexOf("arc delivery land prepare - --json"));
  });

  it("keeps package/project parity and typed progression in the integration workflow", async () => {
    const [packaged, project] = await copies("integration");
    expect(project).toBe(packaged);
    expectTypedProgression(reviewSection(
      packaged,
      "Read `integrationBoundary.reservation`",
      "While a hosted await is live",
    ));
  });
});
