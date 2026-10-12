/** Shipped workflow contracts for typed hosted-review fan-out. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedProse } from "../helpers/soft-wrapped-prose.js";

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
  const startIndex = start.startsWith("#")
    ? workflow.indexOf(start)
    : indexOfSoftWrappedProse(workflow, start);
  const endIndex = end.startsWith("#")
    ? workflow.indexOf(end, startIndex + 1)
    : indexOfSoftWrappedProse(workflow, end, startIndex + 1);
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
  expect(section).toMatch(softWrappedProse("Dispatch only on `nextAction`"));
  expect(section).toContain("review-hosted-request");
  expect(section).toContain("review-local-prepare");
  expect(section).toContain("review-local-resume");
  expect(section).toContain("arc review local prepare -");
  expect(section).toContain("arc review local resume -");
  expect(section).toMatch(/action` unchanged[\s\S]*`deliveryAdmission/iu);
  expect(section).not.toContain("memberHeadObjectId");
  expect(section).toMatch(/local\s+(?:attempt|operation)[\s\S]*arc review status/iu);
  expect(section).toMatch(
    /obtain-ceiling-override[\s\S]*exact\s+`consequence`[\s\S]*stops?\s+without\s+requesting[\s\S]*explicit\s+approval[\s\S]*--ceiling-override/iu,
  );
  expect(section).toContain("resolve-review-applicability");
  expect(section).toContain("arc candidate applicability resolve");
  expect(section).toMatch(softWrappedProse("pass the returned action unchanged"));
  expect(section).toMatch(
    /requested\s+\/\s+await[\s\S]*returned\s+`action`\s+unchanged[\s\S]*pending\s+\/\s+await[\s\S]*newly\s+returned\s+`action`\s+unchanged/iu,
  );
  expect(section).toMatch(/returned\s+settlement\s+plan|payload\.hostedSettlementPlan/iu);
  expect(section).toContain("payload.hostedSettlementPlan.actorIdentity");
  expect(section).toContain("payload.hostedFixTarget");
  expect(section).toMatch(/delivery-member-advanced[\s\S]*delivery-member-current/iu);
  expect(section).toMatch(softWrappedProse("typed discharge conjunction"));
  expect(section).not.toMatch(
    /for\s+each\s+(?:retained\s+)?member|enumerate\s+(?:the\s+)?members|priorAttemptId|priorHead|currentHead|priorBase|currentBase|projectionDigest|residualDigest/iu,
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
    expect(section).toMatch(/typed\s+settled\s+variant\s+without\s+a\s+conjunction\s+is\s+also\s+authoritative/iu);
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
      /resolve-delivery-status[\s\S]*Step\s+2[\s\S]*do\s+not\s+resolve\s+a\s+singleton\s+change\s+request/iu,
    );
    expect(entryDispatch).toMatch(
      /candidate-renewal-required[\s\S]*attestationAction[\s\S]*requires\s+`unchanged`[\s\S]*without\s+replaying[\s\S]*verification/iu,
    );
    expect(entryDispatch).toMatch(
      /candidate-verification-required[\s\S]*verification\s+closeout[\s\S]*no[\s\S]*attestation\s+or\s+review\s+action/iu,
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
      /terminusAction[\s\S]*arc review terminus accept -[\s\S]*recorded\s+\/\s+commit-boundary[\s\S]*exact-replay\s+\/\s+continue[\s\S]*refused\s+\/\s+rerun-status/iu,
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
      /exact-replay\s+\/\s+continue[\s\S]*refused\s+\/\s+rerun-status[\s\S]*re-enter\s+status\s+directly/iu,
    );
    expect(section).toMatch(
      /review-hosted-request[\s\S]*review-local-prepare[\s\S]*terminusAction[\s\S]*optional\s+Owner\s+alternative[\s\S]*absent\s+explicit\s+acceptance[\s\S]*review\s+action\s+unchanged/iu,
    );
    expect(section).toMatch(
      softWrappedProse("When `resolve-review-applicability` carries `terminusAction`, surface that exact Owner alternative first."),
    );
    expect(section).toMatch(
      /Owner\s+alternative\s+first[\s\S]*Absent[\s\S]*explicit\s+acceptance[\s\S]*selectionAction/iu,
    );
    expect(section).toMatch(/terminus[\s\S]*never[\s\S]*(?:clean|converged)/iu);
    const deliveryResume = section.indexOf("`resolve-delivery-status`");
    const singletonResume = section.indexOf("`continue-pre-publication-review`", deliveryResume);
    expect(deliveryResume).toBeGreaterThanOrEqual(0);
    expect(singletonResume).toBeGreaterThan(deliveryResume);
    const publicDeliveryResume = section.slice(deliveryResume, singletonResume);
    expect(section).toMatch(softWrappedProse("selects the first outstanding retained member"));
    expect(publicDeliveryResume).toContain("integrationBoundary.nextAction.command");
    expect(publicDeliveryResume).not.toContain("arc review pre-publication");
  });
});
