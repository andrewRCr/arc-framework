/** An ownership journal refuses authored input before any store-dependent write preparation. */
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHandoffFixture } from "../../../helpers/store/projection/handoff-fixture.js";
import { createWriteBackPort, prepareCapturedWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { prepareIndexedProjectionSubmission } from "../../../../src/lib/store/projection/submission.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

const fixtures: Awaited<ReturnType<typeof createHandoffFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(h => h.dispose())); });

it.each([["md", "captured"], ["txt", "captured"], ["md", "ordinary"], ["txt", "ordinary"]] as const)(
  "refuses a journaled %s file at %s take-in", async (extension, mode) => {
  const h = await createHandoffFixture(extension);
  fixtures.push(h);
  await h.edit("a late leaving edit\n");
  const stat = await readStat(join(h.checkout, h.path));
  if (stat === null) throw new Error("Missing authored file");
  const captured = { kind: "read" as const, content: "a late leaving edit\n", stamp: h.entry.base.blob,
    read: { stat, blob: gitBlobId(await h.file(), "sha1") } };
  if (mode === "captured") expect(await prepareCapturedWriteBack(h.context, h.request, captured))
    .toMatchObject({ kind: "held", result: { answer: "refused" } });
  else expect(await createWriteBackPort(h.context)(h.request)).toMatchObject({ answer: "refused" });
  expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: { version: h.entry.base.version } });
  expect(await h.store.read({ reference: h.arrival.reference })).toMatchObject({ status: "ok", result: { content: h.record.content } });
  expect(await h.file()).toContain("a late leaving edit");
});

it("refuses an earlier prepared edit once fresh local capture finds a journaled handoff", async () => {
  const h = await createHandoffFixture("txt");
  fixtures.push(h);
  await h.edit("captured before the handoff\n");
  const stat = await readStat(join(h.checkout, h.path));
  if (stat === null) throw new Error("Missing authored file");
  const request = { ...h.request, entry: h.entry };
  const prepared = await prepareCapturedWriteBack(h.context, request, { kind: "read", content: "captured before the handoff\n",
    stamp: null, read: { stat, blob: gitBlobId(await h.file(), "sha1") } });
  if (prepared.kind !== "ready") throw new Error("Pre-handoff preparation refused");
  await writeProjectionIndex(h.location, h.journal);
  expect(await prepareIndexedProjectionSubmission(h.context, request, prepared)).toMatchObject({ status: "refused",
    refusal: { condition: expect.stringContaining("Ownership handoff"), remedy: { text: expect.stringContaining("delete the withheld file") } } });
  expect(await h.store.read({ reference: h.entry.reference })).toMatchObject({ status: "ok", result: { version: h.entry.base.version } });
  expect(await h.store.read({ reference: h.arrival.reference })).toMatchObject({ status: "ok", result: { version: h.arrival.base.version } });
});
