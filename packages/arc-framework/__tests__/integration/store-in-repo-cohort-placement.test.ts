/** Interim storage refuses cohort moves atomically and keeps content corrections writable. */
import { expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { createInRepoFixture } from "../helpers/store/in-repo-fixture.js";
import { success } from "../helpers/store/suite-tools.js";

it("refuses completed cohort placement for a single write and a whole batch", async () => {
  const fixture = await createInRepoFixture();
  const provenance = { verb: "archive", lifecycleAction: "archive" };
  const reference = fixture.reference("cohort/document");
  const content = `# Cohort: ${reference.owner.name}\n\n**Purpose:** A concrete result.\n`;
  success(await fixture.store.write({ action: "put", reference, expected: null, content, provenance }));
  await fixture.settle();
  const original = success(await fixture.store.read({ reference }));
  const move = recordPut(original, { placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  const refused = { status: "refused", refusal: { code: "unsupported", remedy: { text: expect.stringContaining("arc archive") } } };
  expect(await fixture.store.write({ ...move, provenance })).toMatchObject(refused);
  const other = fixture.reference("cohort/document", "two");
  expect(await fixture.store.batch({ writes: [
    { action: "put", reference: other, expected: null, content: `# Cohort: ${other.owner.name}\n\n**Purpose:** Another result.\n` }, move,
  ], provenance })).toMatchObject(refused);
  expect(await fixture.store.read({ reference: other })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(success(await fixture.store.read({ reference }))).toEqual(original);
  const corrected = content.replace("A concrete result.", "A corrected result.");
  success(await fixture.store.write({ ...recordPut(original, { content: corrected }), provenance }));
  expect(success(await fixture.store.read({ reference })).content).toBe(corrected);
});
