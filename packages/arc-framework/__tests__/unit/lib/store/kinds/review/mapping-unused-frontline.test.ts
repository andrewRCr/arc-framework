import { expect, it } from "vitest";
import { createFrontlineMappingFixture, mappingOperation } from "../../../../../fixtures/review-mapping.js";
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
  const { input, source } = await historicalFrontlineInput();
  expect(() => mapReviewRecords(input)).toThrow(expect.objectContaining({ name: "ReviewMappingSourceError",
    source: source.path, message: expect.stringContaining("sourceOrdinal") }));
});

it("leaves a frontline outcome behind for its lane's not-live owner, not as a retired attempt", async () => {
  const { input } = await createFrontlineMappingFixture();
  input.workItems = input.workItems.map(row => ({ ...row, live: false }));
  expect(mapReviewRecords(input).listing).toEqual(expect.arrayContaining([{ source: "arc/review-gate/outcomes/frontline-outcome.json",
    outcome: "left-behind", records: [], reason: "No live work item owns this review fact." }]));
});

it("lists a frontline outcome whose lane attempt is pending as in flight with that lane", async () => {
  const { fixture, input } = await createFrontlineMappingFixture();
  const lane = mappingOperation({ ...fixture.lane, completedPasses: 0, attempts: fixture.lane.attempts.map(attempt => ({ ...attempt,
    outcome: "pending", terminalProducer: false,
    ...(attempt.frontline === undefined ? {} : { frontline: { ...attempt.frontline, effectiveCoverage: null } }) })) });
  input.gate = input.gate.map(entry => entry.path === lane.path ? lane : entry);
  expect(mapReviewRecords(input).listing).toEqual(expect.arrayContaining([{ source: "arc/review-gate/outcomes/frontline-outcome.json",
    outcome: "in-flight", records: [], reason: `Its frontline attempt is pending in ${lane.path}.` }]));
});
