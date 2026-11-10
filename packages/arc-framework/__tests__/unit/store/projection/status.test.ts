/** Projection status exposes outstanding index state without mutating its authority. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildProjectionStatusSummary, readProjectionStatus } from "../../../../src/lib/store/projection/status.js";
import { interpretProjectionView } from "../../../../src/lib/store/projection/view-settings.js";
import { PROJECTION_INDEX_FILE, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { createStore } from "../../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-store-ports.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(h => h.dispose())); });

it.each(["ready", "no-projection", "unusable"] as const)("reports view warnings with a %s index without changing its authority", async kind => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  const path = join(h.location.stateDir, PROJECTION_INDEX_FILE);
  if (kind === "no-projection") await rm(path);
  if (kind === "unusable") await writeFile(path, "not JSON");
  const bytes = await readFile(path, "utf8").catch(() => null), reference = await readReference(h.checkout);
  const interpreted = interpretProjectionView({ setting: "unknown", pins: [] });
  const view = { ...interpreted.view, diagnostics: interpreted.diagnostics };
  const result = await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location, view: async () => view });
  expect(result).toMatchObject({ kind, view });
  expect(buildProjectionStatusSummary(result)).toContain('arc.inflightView value "unknown"');
  expect(buildProjectionStatusSummary(result)).toContain("mine, cohort, or all");
  expect(await readFile(path, "utf8").catch(() => null)).toBe(bytes);
  expect(await readReference(h.checkout)).toBe(reference);
  await writeProjectionIndex(h.location, h.index);
  const repaired = interpretProjectionView({ setting: "all", pins: [] });
  const next = await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location,
    view: async () => ({ ...repaired.view, diagnostics: repaired.diagnostics }) });
  expect(next).toMatchObject({ kind: "ready", view: { mode: "all", diagnostics: [] } });
  expect(buildProjectionStatusSummary(next)).toBe("Clean.");
});

it("reads a pending refusal without writing the index or racy reference, and observes its repair", async () => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  const refused = { reason: "record-malformed: The edited prose was refused.",
    remedy: { text: "Repair the prose, then retry.", argv: ["repair-prose", "local data"] } };
  await writeProjectionIndex(h.location, { ...h.index, entries: { [h.path]: { ...h.entry, pending: true, refused } } });
  const before = await readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), "utf8");
  const reference = await readReference(h.checkout);
  const result = await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location });
  expect(result).toMatchObject({ kind: "ready", files: [{ path: h.path, pending: true, refused }], copies: [] });
  expect(() => JSON.stringify(result)).not.toThrow();
  expect(await readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), "utf8")).toBe(before);
  expect(await readReference(h.checkout)).toBe(reference);
  await writeProjectionIndex(h.location, h.index);
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location }))
    .toEqual({ kind: "ready", files: [], copies: [] });
});

it("includes withheld and ownerless files and open conflicts the projection cannot show", async () => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  success(await h.store.write({ action: "put", reference: h.entry.reference, expected: h.entry.base.version,
    content: "stored side\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const merged = success(await h.store.write({ action: "put", reference: h.entry.reference, expected: h.entry.base.version,
    content: "incoming side\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(merged.conflicts).toHaveLength(1);
  const ownerless = ".arc/backlog/planned/unowned.md";
  const refused = { reason: "ownerless: No item owns this file.", remedy: { text: "Move this file to an owned location, then retry." } };
  await mkdir(dirname(join(h.checkout, ownerless)), { recursive: true });
  await writeFile(join(h.checkout, ownerless), "unadopted prose\n");
  await writeProjectionIndex(h.location, { ...h.index, entries: {
    [h.path]: { ...h.entry, withheld: true, unshown: merged.conflicts },
    [ownerless]: { kind: "ownerless", stat: await readStat(join(h.checkout, ownerless)), refused },
  } });
  const result = await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location });
  expect(result).toMatchObject({ kind: "ready", files: expect.arrayContaining([
    expect.objectContaining({ path: h.path, withheld: true, unshown: merged.conflicts }),
    expect.objectContaining({ path: ownerless, ownerless: true, refused }),
  ]) });
});

it("names a moved-on aside copy and observes its deletion after authoritative settlement", async () => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  await h.edit("first edit\n");
  const written = await writeBackFile(h.context, h.index, h.request);
  const copy = written.result.entry.copies[0];
  if (copy === undefined) throw new Error("Missing displaced copy");
  await writeFile(join(h.checkout, copy.name), renderStampedFile({ content: "late aside edit\n", stamp: h.entry.base.blob }));
  await h.edit("newer path edit\n");
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location }))
    .toMatchObject({ kind: "ready", copies: [{ path: h.path, copy: copy.name, withheld: false }] });
  await rm(join(h.checkout, copy.name));
  await runSecondCheck({ ...h.context, checkout: h.checkout, index: written.index,
    copies: [{ path: h.path, copy: copy.name }], takeIn: createWriteBackPort(h.context) });
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location }))
    .toMatchObject({ kind: "ready", copies: [] });
});

it("reports withheld aside copies even when no file entry owns them", async () => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  const copy = nameAsideFile({ path: h.path, base: h.entry.base.blob, writer: h.context.writer, role: "aside" });
  await mkdir(dirname(join(h.checkout, copy)), { recursive: true });
  await writeFile(join(h.checkout, copy), await h.file());
  await writeProjectionIndex(h.location, { ...h.index, withheldCopies: [copy], entries: {} });
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location }))
    .toEqual({ kind: "ready", files: [], copies: [{ path: h.path, copy, withheld: true }] });
});

it("resolves no projection dependency when the selected backend is dark", async () => {
  const checkout = "/not-a-repository";
  const store = createStore(createDefaultStorePorts({ checkoutRoot: checkout,
    exec: async () => { throw new Error("Git must remain dark"); } }));
  expect(await readProjectionStatus({ store, checkout, ports: () => { throw new Error("Projection I/O must remain dark"); },
    view: () => { throw new Error("View selection must remain dark"); } }))
    .toEqual({ kind: "disabled" });
});

it("reports an absent index without creating one and observes a restored projection", async () => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  await rm(join(h.location.stateDir, PROJECTION_INDEX_FILE));
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location })).toEqual({ kind: "no-projection" });
  await expect(readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE))).rejects.toMatchObject({ code: "ENOENT" });
  await writeProjectionIndex(h.location, h.index);
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location })).toMatchObject({ kind: "ready" });
});

it.each(["unreadable", "other-format"] as const)("reports an %s index with a remedy and observes its repair", async cause => {
  const h = await createWriteBackFixture();
  fixtures.push(h);
  const text = cause === "unreadable" ? "not JSON" : JSON.stringify({ format: 1 });
  await writeFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), text);
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location }))
    .toMatchObject({ kind: "unusable", cause, remedy: { text: expect.stringContaining("Restore a readable projection index") } });
  expect(await readFile(join(h.location.stateDir, PROJECTION_INDEX_FILE), "utf8")).toBe(text);
  await writeProjectionIndex(h.location, h.index);
  expect(await readProjectionStatus({ store: h.store, checkout: h.checkout, location: h.location })).toMatchObject({ kind: "ready" });
});
