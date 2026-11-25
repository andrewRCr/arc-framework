/** Write admission distinguishes lost metadata objects from readable record-free namespaces. */

import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("write object faults in %s", layout => {
  it.each([false, true])("restores a lost metadata blob before retrying a write (record-free: %s)", async recordFree => {
    const f = await createRefFixture({}, layout);
    const record = await seed(f, f.reference("personal/document"), "Original record.\n");
    const home = expandStoredPath(record.reference), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    if (recordFree) {
      const entries = await capturedEntries(f, home.ref);
      const parent = (await f.ports.exec("git", [...scope, "rev-parse", home.ref])).stdout.trim();
      await plantRef(f.root, home.ref, entries.filter(entry => entry.path === home.metadataPath), { parents: [parent], gitDir: f.gitDir });
    }
    const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
    const before = await f.settle();
    const mutation = { action: "put" as const, reference: record.reference, expected: recordFree ? null : record.version,
      content: "Retry after exact restoration.\n", provenance: testProvenance };
    await removeLooseObject(f.root, oid, f.gitDir);
    expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    expect(await f.settle()).toBe(before);
    const restored = await f.ports.rawExec([...scope, "hash-object", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    success(await f.store.write(mutation));
    expect(success(await f.store.read({ reference: record.reference })).content).toBe(mutation.content);
  });
  it("reports a lost immutable record before its ordinary version conflict", async () => {
    const f = await createRefFixture({}, layout);
    const record = await seed(f, f.reference("personal/routing-receipt"));
    const home = expandStoredPath(record.reference), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
    const before = await f.settle(), mutation = update(f, record);
    await removeLooseObject(f.root, oid, f.gitDir);
    expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", reference: record.reference, historyRefs: [],
      remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    expect(await f.settle()).toBe(before);
    const restored = await f.ports.rawExec([...scope, "hash-object", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: {
      code: "version-conflict", records: [record.reference],
    } });
    expect(success(await f.store.read({ reference: record.reference }))).toEqual(record);
  });
  it("names retained history for a checked completed record's lost prior blob", async () => {
    const f = await createRefFixture({ "work-item/meta": { check: async () => [] } }, layout);
    const live = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, live, live.content),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const record = success(await f.store.read({ reference: live.reference }));
    const home = expandStoredPath(record.reference, { history: true }), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
    const mutation = update(f, record), before = await f.settle();
    await removeLooseObject(f.root, oid, f.gitDir);
    expect(await f.store.write(mutation)).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", reference: record.reference, historyRefs: [home.ref],
      remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    expect(await f.settle()).toBe(before);
    const restored = await f.ports.rawExec([...scope, "hash-object", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    success(await f.store.write(mutation));
    expect(success(await f.store.read({ reference: record.reference })).content).toBe(mutation.content);
  });
});
