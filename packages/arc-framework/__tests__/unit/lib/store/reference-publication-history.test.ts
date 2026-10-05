/** Reference publication and implicit conflict removal retain durable query evidence. */
import { describe, expect, it } from "vitest";
import { BatchInputSchema, WriteInputSchema } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

describe("reference publication history", () => {
  it("publishes exact write provenance, saved states, and newest-first updates without noop duplicates", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const from = success(await remote.version());
    const first = await seed(fixture, fixture.reference("work-item/meta"));
    success(await fixture.store.sync());
    const published = success(await remote.version());
    const creation = { reference: first.reference, version: first.version, content:first.content,
      provenance: { ...testProvenance, reference: first.reference, ownerUid: "uid" in first.reference.owner ? first.reference.owner.uid : undefined } };
    expect(success(await remote.history({ reference: first.reference }))).toEqual([creation]);
    expect(success(await remote.changes({ from, to: published, references: [first.reference] }))).toEqual([creation]);
    const changed = success(await fixture.store.write(WriteInputSchema.parse({ ...update(fixture, first), provenance: { verb: "rename", lifecycleAction: "progress", codeHead: "b".repeat(40) } })));
    success(await fixture.store.sync());
    const to = success(await remote.version());
    expect(success(await remote.read({ reference: first.reference, asOf: published }))).toEqual(first);
    const history = success(await remote.history({ reference: first.reference }));
    expect(history).toMatchObject([{ version: changed.version, provenance: { verb: "rename", lifecycleAction: "progress", codeHead: "b".repeat(40) } }, creation]);
    expect(success(await remote.changes({ from: published, to, references: [first.reference] }))).toEqual([history[0]]);
    expect(success(await fixture.store.sync()).publishes[0]?.status).toBe("noop");
    expect(success(await remote.version())).toBe(to);
    expect(success(await remote.history({ reference: first.reference }))).toEqual(history);
    const independentlyWritten = success(await remote.write(WriteInputSchema.parse(update(fixture, success(await remote.read({ reference: first.reference })), fixture.content(first.reference, "changed-again")))));
    success(await fixture.store.sync());
    expect(success(await fixture.reopen().read({ reference: first.reference })).version).toBe(independentlyWritten.version);
    expect(success(await remote.history({ reference: first.reference }))).toMatchObject([{ version: independentlyWritten.version }, ...history]);
  });

  it("publishes one batch's caller facts for all additions, updates, and removals", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const first = await seed(fixture, fixture.reference("personal/document"));
    success(await fixture.store.sync());
    const from = success(await remote.version());
    const second = fixture.reference("personal/document", "two");
    const { provenance: ignored, ...updated } = update(fixture, first);
    void ignored;
    const batch = success(await fixture.store.batch(BatchInputSchema.parse({ writes: [updated,
      { action: "put", reference: second, expected: null, content: fixture.content(second) }], provenance: testProvenance })));
    success(await fixture.store.sync());
    const to = success(await remote.version());
    const changes = success(await remote.changes({ from, to, references: batch.writes.map((write) => write.reference) }));
    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.version)).toEqual(batch.writes.map((write) => write.version));
    for (const change of changes) expect(change.provenance).toMatchObject({ ...testProvenance, batchId: batch.batchId, reference: change.reference });
    const removed = success(await fixture.store.batch(BatchInputSchema.parse({ writes: batch.writes.map((write) => ({ action: "remove", reference: write.reference, expected: write.version })), provenance: { verb: "remove", lifecycleAction: "remove" } })));
    success(await fixture.store.sync());
    const final = success(await remote.version());
    const removals = success(await remote.changes({ from: to, to: final, references: batch.writes.map((write) => write.reference) }));
    expect(removals).toHaveLength(2);
    for (const removal of removals) {
      expect(removal).toMatchObject({ version: null, content: null, provenance: { verb: "remove", batchId: removed.batchId, reference: removal.reference } });
      expect(success(await remote.history({ reference: removal.reference }))[0]).toEqual(removal);
      expect(await remote.read({ reference: removal.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(success(await remote.read({ reference: removal.reference, asOf: to }))).toMatchObject({ version: changes.find((change) => JSON.stringify(change.reference) === JSON.stringify(removal.reference))?.version });
    }
  });

  it("publishes no local event on exhausted retries and records the repaired publish once", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const first = await seed(fixture, fixture.reference("personal/document"));
    const from = success(await remote.version());
    fixture.remoteState("contended");
    expect(success(await fixture.store.sync()).publishes[0]).toMatchObject({ status: "failed", failure: { code: "retries-exhausted" } });
    const contended = success(await remote.version());
    expect(success(await remote.changes({ from, to: contended, references: [first.reference] }))).toEqual([]);
    expect(await remote.history({ reference: first.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    fixture.remoteState("available");
    success(await fixture.store.sync());
    const history = success(await remote.history({ reference: first.reference }));
    expect(history).toMatchObject([{ version: first.version, provenance: testProvenance }]);
    expect(success(await remote.changes({ from: contended, to: success(await remote.version()), references: [first.reference] }))).toEqual(history);
  });

  it("records merged versions with reconciliation provenance alongside original remote writes", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const first = await seed(fixture, fixture.reference("personal/document"), "opening\nbase\nclosing\n");
    success(await fixture.store.sync());
    const localWrite = success(await fixture.store.write(WriteInputSchema.parse(update(fixture, first, "local opening\nbase\nclosing\n"))));
    const remoteWrite = success(await remote.write(WriteInputSchema.parse(update(fixture, first, "opening\nbase\nremote closing\n"))));
    const from = success(await remote.version());
    expect(success(await fixture.store.sync()).publishes[0]?.status).toBe("reconciled");
    const merged = success(await remote.read({ reference: first.reference }));
    expect(merged.content).toBe("local opening\nbase\nremote closing\n");
    expect(merged.version).not.toBe(localWrite.version);
    expect(merged.version).not.toBe(remoteWrite.version);
    expect(success(await fixture.store.history({ reference: first.reference }))).toMatchObject([
      { version: merged.version, provenance: { verb: "sync", lifecycleAction: "reconcile" } },
      { version: remoteWrite.version }, { version: localWrite.version }, { version: first.version },
    ]);
    const history = success(await remote.history({ reference: first.reference }));
    expect(history).toMatchObject([{ version: merged.version, provenance: { verb: "sync", lifecycleAction: "reconcile", reference: first.reference } },
      { version: localWrite.version }, { version: remoteWrite.version, provenance: testProvenance }, { version: first.version }]);
    expect(success(await remote.changes({ from, to: success(await remote.version()), references: [first.reference] }))).toEqual([history[1], history[0]]);
  });

  it.each(["identical", "conflicting"] as const)("retains accepted remote provenance once for %s concurrent prose", async (mode) => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const first = await seed(fixture, fixture.reference("personal/document"), "opening\nbase\nclosing\n");
    success(await fixture.store.sync());
    const localFrom = success(await fixture.store.version()), remoteFrom = success(await remote.version());
    success(await fixture.store.write(WriteInputSchema.parse({
      ...update(fixture, first, "opening\nlocal\nclosing\n"), provenance: { verb: "local-edit", lifecycleAction: "edit" },
    })));
    const remoteWrite = success(await remote.write(WriteInputSchema.parse({
      ...update(fixture, first, mode === "identical" ? "opening\nlocal\nclosing\n" : "opening\nremote\nclosing\n"),
      provenance: { verb: "remote-edit", lifecycleAction: "edit", codeHead: "d".repeat(40) },
    })));
    const original = success(await remote.history({ reference: first.reference })).find((entry) => entry.version === remoteWrite.version)!;
    const remoteWritten = success(await remote.version());
    expect(success(await fixture.store.sync()).publishes[0]?.status).toBe("reconciled");
    const localTo = success(await fixture.store.version()), remoteTo = success(await remote.version());
    const localHistory = success(await fixture.store.history({ reference: first.reference }));
    const remoteHistory = success(await remote.history({ reference: first.reference }));
    const localChanges = success(await fixture.store.changes({ from: localFrom, to: localTo, references: [first.reference] }));
    const remoteChanges = success(await remote.changes({ from: remoteFrom, to: remoteTo, references: [first.reference] }));
    for (const store of [fixture.store, remote]) {
      expect(success(await store.read({ reference: first.reference })).version).toBe(remoteWrite.version);
    }
    for (const entries of [localHistory, remoteHistory, localChanges, remoteChanges]) {
      expect(entries.filter((entry) => entry.version === remoteWrite.version)).toEqual([original]);
    }
    expect(success(await remote.changes({ from: remoteWritten, to: remoteTo, references: [first.reference] }))
      .filter((entry) => entry.version === remoteWrite.version)).toEqual([]);
    for (let replay = 0; replay < 2; replay++) {
      const reopened = fixture.reopen();
      expect(success(await reopened.sync()).publishes[0]?.status).toBe("noop");
      expect(success(await reopened.version())).toBe(localTo);
      expect(success(await remote.version())).toBe(remoteTo);
      expect(success(await reopened.history({ reference: first.reference }))).toEqual(localHistory);
      expect(success(await remote.history({ reference: first.reference }))).toEqual(remoteHistory);
      expect(success(await reopened.changes({ from: localFrom, to: localTo, references: [first.reference] }))).toEqual(localChanges);
      expect(success(await remote.changes({ from: remoteFrom, to: remoteTo, references: [first.reference] }))).toEqual(remoteChanges);
    }
  });

  it.each([false, true])("records a named conflict's implicit removal locally and remotely, batch: %s", async (batch) => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const first = await seed(fixture, fixture.reference("personal/document"), "base\n");
    success(await fixture.store.write(WriteInputSchema.parse(update(fixture, first, "current\n"))));
    const clash = success(await fixture.store.write(WriteInputSchema.parse(update(fixture, first, "incoming\n"))));
    const conflict = clash.conflicts[0]!;
    success(await fixture.store.sync());
    const localFrom = success(await fixture.store.version()), remoteFrom = success(await remote.version());
    const write = WriteInputSchema.parse({ ...update(fixture, success(await fixture.store.read({ reference: first.reference })), "resolved\n"), resolves: [conflict], provenance: { verb: "resolve", lifecycleAction: "resolve", codeHead: "c".repeat(40) } });
    if (batch) {
      const { provenance, ...mutation } = write;
      success(await fixture.store.batch(BatchInputSchema.parse({ writes: [mutation], provenance })));
    } else success(await fixture.store.write(write));
    const removals = success(await fixture.store.changes({ from: localFrom, to: success(await fixture.store.version()), references: [conflict] }));
    expect(removals).toMatchObject([{ reference: conflict, version: null, content: null, provenance: { verb: "resolve", codeHead: "c".repeat(40), reference: conflict } }]);
    expect(success(await fixture.reopen().history({ reference: conflict }))[0]).toEqual(removals[0]);
    expect(await fixture.store.read({ reference: conflict })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    success(await fixture.store.sync());
    expect(success(await remote.changes({ from: remoteFrom, to: success(await remote.version()), references: [conflict] }))).toEqual(removals);
    expect(success(await remote.history({ reference: conflict }))[0]).toEqual(removals[0]);
    expect(success(await remote.read({ reference: conflict, asOf: remoteFrom })).reference).toEqual(conflict);
  });
});
