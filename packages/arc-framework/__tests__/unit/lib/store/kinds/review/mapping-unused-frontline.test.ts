import { expect, it } from "vitest";
import { createFrontlineMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";

async function historicalFrontlineInput() {
  const { input } = await createFrontlineMappingFixture();
  const source = input.gate.find(({ path }) => path.includes("/outcomes/"))!;
  const value = JSON.parse(new TextDecoder().decode(source.bytes)) as {
    record: { outcome: { findings: { sourceOrdinal?: number }[] } };
  };
  delete value.record.outcome.findings[0]!.sourceOrdinal;
  source.bytes = new TextEncoder().encode(JSON.stringify(value));
  return { input, source };
}

it("leaves an unjoined historical frontline payload behind without decoding its findings", async () => {
  const { input, source } = await historicalFrontlineInput();
  input.gate = [source];
  expect(mapReviewRecords(input)).toMatchObject({ records: [], listing: [
    { source: source.path, outcome: "left-behind", reason: expect.stringMatching(/no current attempt|retired/iu) },
  ] });
});

it("excludes a foreign historical frontline payload before decoding its findings", async () => {
  const { input, source } = await historicalFrontlineInput();
  input.gate = [source];
  input.projectId = "22222222-2222-4222-8222-222222222222";
  expect(mapReviewRecords(input)).toMatchObject({ records: [], listing: [
    { source: source.path, outcome: "left-behind", reason: "Record names another repository ID." },
  ] });
});

it("requires the complete native payload schema when a live attempt joins the frontline result", async () => {
  const { input } = await historicalFrontlineInput();
  expect(() => mapReviewRecords(input)).toThrow(/sourceOrdinal/u);
});
