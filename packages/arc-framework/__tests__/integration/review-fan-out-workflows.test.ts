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
  expect(section).toMatch(
    /requested \/ await[\s\S]*returned `action` unchanged[\s\S]*pending \/ await[\s\S]*newly returned `action` unchanged/iu,
  );
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
      "Only a native arm admitted",
    );
    expectTypedProgression(section);
    expect(section).toMatch(/typed settled variant\s+without a\s+conjunction is also authoritative/iu);
    expect(packaged.indexOf("arc delivery native land-prepare -"))
      .toBeGreaterThan(packaged.indexOf("arc review status"));
    expect(packaged.indexOf("arc delivery land prepare -"))
      .toBeGreaterThan(packaged.indexOf("arc review status"));
    expect(packaged.indexOf("arc delivery land apply -"))
      .toBeGreaterThan(packaged.indexOf("arc delivery land prepare -"));
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
      /resolve-delivery-status[\s\S]*Step 2[\s\S]*do not resolve a singleton change request/iu,
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
    const terminusSection = reviewSection(
      section,
      "When the Owner accepts any returned delivery-member terminus",
      "`review-hosted-request` means",
    );
    const recordedTerminus = terminusSection.indexOf("`recorded / commit-boundary`");
    const correctionResume = terminusSection.indexOf("arc delivery review-fix continue -");
    const exactReplay = terminusSection.indexOf("`exact-replay / continue`");
    expect(recordedTerminus).toBeGreaterThanOrEqual(0);
    expect(correctionResume).toBeGreaterThan(recordedTerminus);
    expect(exactReplay).toBeGreaterThan(correctionResume);
    expect(terminusSection).toMatch(
      /exact-replay \/ continue[\s\S]*refused \/ rerun-status[\s\S]*re-enter status directly/iu,
    );
    expect(section).toMatch(
      /review-hosted-request[\s\S]*review-local-prepare[\s\S]*terminusAction[\s\S]*optional Owner alternative[\s\S]*absent explicit acceptance[\s\S]*review action unchanged/iu,
    );
    expect(section).toContain(
      "When `resolve-review-applicability` carries `terminusAction`, surface that exact Owner alternative first.",
    );
    expect(section).toMatch(
      /Owner alternative first[\s\S]*Absent[\s\S]*explicit acceptance[\s\S]*selectionAction/iu,
    );
    expect(section).toMatch(/terminus[\s\S]*never[\s\S]*(?:clean|converged)/iu);
    const deliveryResume = section.indexOf("`resolve-delivery-status`");
    const singletonResume = section.indexOf("`continue-pre-publication-review`", deliveryResume);
    expect(deliveryResume).toBeGreaterThanOrEqual(0);
    expect(singletonResume).toBeGreaterThan(deliveryResume);
    const publicDeliveryResume = section.slice(deliveryResume, singletonResume);
    expect(section).toContain("selects the first outstanding retained member");
    expect(publicDeliveryResume).toContain("integrationBoundary.nextAction.command");
    expect(publicDeliveryResume).not.toContain("arc review pre-publication");
  });
});
