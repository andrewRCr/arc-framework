/** Identity records must be retired or aligned before the import captures their state. */
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { ordinaryErrand, seedTransients } from "../helpers/store/import-transients.js";
import { TransientIdentityRecordSchema, serializeTransientIdentityRecord } from "../../src/lib/errand/identity-record.js";
import { hashBlob, writeTreeCommit } from "../../src/lib/errand/ref-tree.js";
import { retireFixtureErrand, windowClaims } from "../helpers/cutover-window/identity-inputs.js";

it("refuses a local Errand record and passes once the Errand is abandoned", async () => {
  const h = await windowFixture(), tip = await seedTransients(h, [ordinaryErrand]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining("example"), condition: expect.stringContaining("local"),
      remedy: expect.stringContaining("abandon") }),
  ]) } });
  await retireFixtureErrand(h, tip);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses an origin-only Errand record and passes once its retirement is published", async () => {
  const h = await windowFixture(), tip = await seedTransients(h, [ordinaryErrand]);
  const ref = "refs/arc/user/andrew/errands";
  await h.git("git", ["push", "origin", ref]); await h.git("git", ["update-ref", "-d", ref, tip]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining("example"), condition: expect.stringContaining("origin"),
      remedy: expect.stringContaining("abandon") }),
  ]) } });
  await retireFixtureErrand(h, tip, { localTip: null }); await h.git("git", ["push", "origin", ref]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("admits grooming and housekeep routing claims on both acquired sides", async () => {
  const h = await windowFixture(), head = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await seedTransients(h, windowClaims(head)); await h.git("git", ["push", "origin", "refs/arc/user/andrew/errands"]);
  const checked = await checkFixture(h);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses different local and origin identity tips and passes once the local claims are pushed", async () => {
  const h = await windowFixture(), head = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const records = windowClaims(head), held = await seedTransients(h, records), ref = "refs/arc/user/andrew/errands";
  await h.git("git", ["push", "origin", ref]);
  const io = { exec: h.ports.exec, execInput: h.ports.execInput, identity: "andrew" }, entries = new Map<string, string>();
  for (const record of records) entries.set(record.slug, await hashBlob(io.execInput,
    serializeTransientIdentityRecord(TransientIdentityRecordSchema.parse({ ...record, updatedAt: "2026-01-01T00:00:01.000Z" }))));
  const local = await writeTreeCommit(io, entries, "Advance the local claims", [held], held);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: ref, condition: expect.stringContaining(local), remedy: expect.stringContaining("push") }),
  ]) } });
  expect(refused.report).toContain(held);
  await h.git("git", ["push", "origin", ref]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses origin-only claims and passes once their identity ref is fetched locally", async () => {
  const h = await windowFixture(), head = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const tip = await seedTransients(h, windowClaims(head)), ref = "refs/arc/user/andrew/errands";
  await h.git("git", ["push", "origin", ref]); await h.git("git", ["update-ref", "-d", ref, tip]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: ref, condition: expect.stringContaining("local absent"), remedy: expect.stringContaining("Fetch") }),
  ]) } });
  await h.git("git", ["fetch", "--refmap=", "origin", `${ref}:${ref}`]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it.each(["local", "origin"] as const)("refuses another identity's claims in %s until their owner closes them", async side => {
  const h = await windowFixture(), head = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const tip = await seedTransients(h, windowClaims(head), "alex"), ref = "refs/arc/user/alex/errands";
  if (side === "origin") {
    await h.git("git", ["push", "origin", ref]); await h.git("git", ["update-ref", "-d", ref, tip]);
  }
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "identity alex", condition: expect.stringContaining(side), remedy: expect.stringContaining("alex") }),
  ]) } });
  await writeTreeCommit({ exec: h.ports.exec, execInput: h.ports.execInput, identity: "alex" }, new Map(),
    "Close the other person's claims", [tip], side === "origin" ? null : tip);
  if (side === "origin") await h.git("git", ["push", "origin", ref]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("uses the configured identity when admitting local-only claims", async () => {
  const h = await windowFixture(), head = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await h.git("git", ["config", "arc.identity", "alex"]);
  await seedTransients(h, windowClaims(head), "alex");
  const checked = await checkFixture(h);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);
