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
  expect(section).toContain("review-local-prepare");
  expect(section).toContain("review-local-resume");
  expect(section).toContain("arc review local prepare -");
  expect(section).toContain("arc review local resume -");
  expect(section).toMatch(/action` unchanged[\s\S]*`deliveryAdmission/iu);
  expect(section).not.toContain("memberHeadObjectId");
  expect(section).toMatch(/local (?:attempt|operation)[\s\S]*arc review status/iu);
  expect(section).toMatch(
    /obtain-ceiling-override[\s\S]*exact `consequence`[\s\S]*stops? without requesting[\s\S]*explicit approval[\s\S]*--ceiling-override/iu,
  );
  expect(section).toContain("resolve-review-applicability");
  expect(section).toContain("arc candidate applicability resolve");
  expect(section).toContain("pass the returned action unchanged");
  expect(section).toMatch(/pass the returned self-contained handle|re-invoke the same handle/iu);
  expect(section).toMatch(/returned settlement plan|payload\.hostedSettlementPlan/iu);
  expect(section).toContain("payload.hostedFixTarget");
  expect(section).toMatch(/delivery-member-advanced[\s\S]*delivery-member-current/iu);
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
      "### Settle exact member review authority",
      "Only the settled native arm advances",
    );
    expectTypedProgression(section);
    expect(section).toMatch(/typed settled variant\s+without a conjunction is also authoritative/iu);
    expect(packaged.indexOf("arc delivery native land-prepare - --json"))
      .toBeGreaterThan(packaged.indexOf("arc review status"));
    expect(packaged.indexOf("arc delivery land prepare - --json"))
      .toBeGreaterThan(packaged.indexOf("arc review status"));
    expect(packaged.indexOf("arc delivery land apply - --json"))
      .toBeGreaterThan(packaged.indexOf("arc delivery land prepare - --json"));
  });

  it("keeps package/project parity and typed progression in the integration workflow", async () => {
    const [packaged, project] = await copies("integration");
    expect(project).toBe(packaged);
    const entryDispatch = reviewSection(
      packaged,
      "Dispatch only on the returned route.",
      "Resolve the branch head",
    );
    expect(entryDispatch).toMatch(
      /continue-hosted-review[\s\S]*Step 2[\s\S]*do not resolve a singleton change request/iu,
    );
    expect(entryDispatch).toMatch(
      /candidate-renewal-required[\s\S]*attestationAction[\s\S]*requires `unchanged`[\s\S]*without replaying[\s\S]*verification/iu,
    );
    expect(entryDispatch).toMatch(
      /candidate-verification-required[\s\S]*verification closeout[\s\S]*no[\s\S]*attestation or review action/iu,
    );
    const section = reviewSection(
      packaged,
      "Read `integrationBoundary.reservation`",
      "While a hosted await is live",
    );
    expectTypedProgression(section);
    expect(section).toMatch(
      /scopeSelection\.mode` is `chunked`[\s\S]*review-chunking[\s\S]*fresh aggregate evaluator[\s\S]*Attest only the aggregate result[\s\S]*partial chunk or seam reports never consume/iu,
    );
    expect(section).toMatch(
      /terminusAction[\s\S]*arc review terminus accept -[\s\S]*recorded \/ commit-boundary[\s\S]*exact-replay \/ continue[\s\S]*refused \/ rerun-status/iu,
    );
    expect(section).toMatch(
      /review-hosted-request[\s\S]*review-local-prepare[\s\S]*terminusAction[\s\S]*optional Owner alternative[\s\S]*absent explicit acceptance[\s\S]*review action unchanged/iu,
    );
    expect(section).toMatch(/terminus[\s\S]*never[\s\S]*(?:clean|converged)/iu);
    const deliveryResume = section.indexOf("`continue-hosted-review`");
    const singletonResume = section.indexOf("`continue-pre-publication-review`", deliveryResume);
    expect(deliveryResume).toBeGreaterThanOrEqual(0);
    expect(singletonResume).toBeGreaterThan(deliveryResume);
    const publicDeliveryResume = section.slice(deliveryResume, singletonResume);
    expect(section).toContain("selects the first outstanding retained member");
    expect(publicDeliveryResume).toContain("integrationBoundary.nextAction.command");
    expect(publicDeliveryResume).not.toContain("arc review pre-publication");
  });
});
