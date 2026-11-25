/** Initial metadata normalization reads the retained creation version, preserving authored soft fields. */
import { expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { META_REGISTRATION } from "../../../../src/lib/store/kinds/meta/registration.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { writeMetaClass, writeMetaPause } from "../../../../src/lib/store/kinds/meta/writers.js";
import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { selectWriteBackBase } from "../../../../src/lib/store/projection/base-selection.js";
import { normalizeStubEdit } from "../../../../src/lib/store/projection/stub-normalization.js";

async function fixture() {
  const f = createReferenceFixture(undefined, { "work-item/meta": { parser: META_REGISTRATION.parser } });
  const reference = f.reference("work-item/meta"), placement = { kind: "backlog", commitment: "planned" } as const;
  const minted = makeMetaFixture(reference.owner.name, { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "draft-design" });
  const created = success(await f.store.write({ action: "put", reference, content: minted, placement, expected: null,
    provenance: { verb: "stub", lifecycleAction: "stub" } }));
  if (created.version === undefined) throw new Error("No minted version");
  success(await f.store.write({ action: "put", reference: created.reference, content: writeMetaClass(minted, "Heavy"), placement,
    expected: created.version, provenance: { verb: "set-class", lifecycleAction: "set-class" } }));
  const authored = makeMetaFixture(reference.owner.name, { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop", nextTask: "An authored next step." }) + "\nPreserve this rationale.\n";
  const entry: RecordEntry = { kind: "record", reference: created.reference, stat: null, written: gitBlobId(authored, "sha1"),
    base: { blob: gitBlobId(minted, "sha1"), version: created.version }, markers: null, notices: [], unshown: [], protected: false,
    changed: true, pending: true, withheld: false, refused: null, persisted: null, inProgress: null, copies: [], adoption: { kind: "write-back", stub: true } };
  return { f, entry, authored, context: { store: f.store, format: "sha1" as const,
    location: { gitDir: "/unused", commonDir: "/unused", stateDir: "/unused", primary: true } } };
}

it("normalizes from the exact minted version after the current Class has advanced", async () => {
  const { f, entry, authored, context } = await fixture();
  const normalized = success(await normalizeStubEdit(context, entry, authored));
  expect(parseMetaRecord(normalized)).toMatchObject({ state: "Planning", workClass: "Light", owner: "andrew",
    currentWorkflow: "draft-design", nextTask: "An authored next step." });
  expect(normalized).toContain("Preserve this rationale.");
  expect(parseMetaRecord(success(await f.store.read({ reference: entry.reference })).content).workClass).toBe("Heavy");
});

it("keeps the established current-base policy for an explicit held resolution", async () => {
  const { f, entry, authored, context } = await fixture();
  const current = success(await f.store.read({ reference: entry.reference }));
  const selected = await selectWriteBackBase(context, { checkout: "/unused", path: ".arc/backlog/planned/alpha/meta-alpha.md",
    copy: null, entry, base: { kind: "stamp", stamp: null }, resolution: { kind: "hold", token: "selected-conflict" } }, authored, null);
  expect(selected).toMatchObject({ status: "ok", result: { kind: "selected", base: { kind: "stored", version: current.version } } });
});

it("removes the authored Pause section when the proved minted record has none", async () => {
  const { entry, authored, context } = await fixture();
  const paused = writeMetaPause(authored, { pausedBy: SlugSchema.parse("andrew"), since: "2026-11-06T00:00:00.000Z",
    reason: "An authored pause requiring a lifecycle verb.", waitsOn: null, resumeNotes: null, open: false });
  const normalized = success(await normalizeStubEdit(context, entry, paused));
  expect(parseMetaRecord(normalized).pause).toBeNull();
  expect(normalized).not.toContain("An authored pause requiring a lifecycle verb.");
  expect(normalized).toContain("Preserve this rationale.");
});
