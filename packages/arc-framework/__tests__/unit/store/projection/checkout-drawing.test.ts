/** A drawing yields to intervening saves and uses the production aside-copy take-in. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";

const fixtures: Awaited<ReturnType<typeof createCheckoutFixture>>[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

async function clashFixture() {
  const fixture = await createCheckoutFixture();
  fixtures.push(fixture);
  const current = fixture.record.content.replace("first edit", "remote edit");
  const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
    content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
  if (remote.status !== "ok") throw new Error("Remote edit refused");
  await fixture.edit("opening\ninitial edit\nclosing\n");
  return { ...fixture, current, version: remote.result.version };
}

async function resolve(fixture: Awaited<ReturnType<typeof clashFixture>>, result: Awaited<ReturnType<typeof writeBackFile>>) {
  const drawn = parseStampedFile(await fixture.file());
  await fixture.edit("opening\nresolved edit\nclosing\nremote note\n", drawn.stamp ?? undefined);
  const retry = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
  expect(retry.result.answer).toBe("taken-in");
  expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
    content: "opening\nresolved edit\nclosing\nremote note\n", conflicts: [],
  } });
}

describe("checkout drawing replacement", () => {
  it.each(["held", "restaged"] as const)("keeps a save encountered by the guard %s and free of the proposed drawing's marks", async mode => {
    const fixture = await clashFixture();
    const late = mode === "held" ? "opening\nlate edit\nclosing\n" : fixture.current;
    const read = fixture.store.read.bind(fixture.store);
    vi.spyOn(fixture.store, "read").mockImplementationOnce(async input => {
      const record = await read(input);
      await fixture.edit(late);
      return record;
    });
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(parseStampedFile(await fixture.file()).content).toBe(late);
    expect(result.result.entry).toMatchObject({ markers: null, refused: null });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: mode === "held" ? fixture.current : late,
    } });
    if (mode === "held") {
      expect(result.result.entry.base).toEqual(fixture.entry.base);
      const next = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
      expect(parseStampedFile(await fixture.file()).content).toContain("<<<<<<<");
      await resolve(fixture, next);
    } else {
      expect(result.result.entry.persisted?.takenIn.kind).toBe("landed");
      expect(parseStampedFile(await fixture.file()).stamp).toBe(gitBlobId(late, "sha1"));
    }
  });

  it("takes in an after-recheck save from the aside and returns its clashing bytes intact", async () => {
    const fixture = await clashFixture();
    const late = "opening\nlate edit\nclosing\n";
    const result = await writeBackFile({ ...fixture.context, hooks: { afterRecheck: async () => { await fixture.edit(late); } } },
      fixture.index, fixture.request);
    expect(fixture.reports).toContainEqual(expect.objectContaining({ copy: expect.any(String), mark: {
      reason: expect.stringContaining("checkout-conflict"), remedy: expect.any(Object),
    } }));
    expect(parseStampedFile(await fixture.file()).content).toBe(late);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: {
      content: fixture.current, version: fixture.version,
    } });
    const next = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(parseStampedFile(await fixture.file()).content).toContain("late edit\n>>>>>>>");
    await resolve(fixture, next);
  });

  it("leaves a path recreated before linking unmarked and at its original base", async () => {
    const fixture = await clashFixture();
    const late = "opening\nrecreated edit\nclosing\n";
    const result = await writeBackFile({ ...fixture.context, hooks: { afterMove: async () => { await fixture.edit(late); } } },
      fixture.index, fixture.request);
    expect(parseStampedFile(await fixture.file()).content).toBe(late);
    expect(result.result.entry).toMatchObject({ markers: null, refused: null, pending: true, base: fixture.entry.base });
    const next = await writeBackFile(fixture.context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(parseStampedFile(await fixture.file()).content).toContain("recreated edit\n>>>>>>>");
    await resolve(fixture, next);
  });
});
