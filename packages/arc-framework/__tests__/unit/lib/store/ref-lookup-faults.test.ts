import { expect, it } from "vitest";

import { metadataUid, metadataValue, refObjectReadFixture } from "../../../helpers/store/ref-object-read.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { writeLineageRecord } from "../../../../src/lib/store/kinds/lineage/index.js";

function registryLineageFixture(options: { metadata?: string | null; missingMetadata?: boolean }) {
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: "alpha" } });
  const fixture = refObjectReadFixture({ namespace: "refs/arc/project/registry", metadataName: "metadata-registry.json",
    metadata: JSON.stringify({ formatVersion: 1, formats: {}, lineage: { [metadataUid]: "alpha" } }), ...options,
    recordPath: `lineage/${metadataUid}.json`, recordContent: writeLineageRecord({ schemaVersion: 2,
      origin: { name: lineage.owner.name }, kind: "abandon", successors: [], incoming: [],
    }),
  });
  return { ...fixture, lineage };
}

it.each([
  { label: "metadata blob", options: { missingMetadata: true } },
  { label: "tip tree", options: { missingTree: true } },
])("keeps an owner's unavailable $label recoverable during slug lookup", async ({ options }) => {
  const { store, reference } = refObjectReadFixture(options);
  expect(await store.lookup({ kind: "slug", slug: reference.owner.name })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
});

it("keeps an unavailable archive quarter recoverable during slug lookup", async () => {
  const metadata = JSON.stringify({ ...metadataValue, primary: { ...metadataValue.primary,
    placement: { kind: "completed", quarter: "2026-q4" },
  } });
  const { store, reference } = refObjectReadFixture({ archive: { root: "01_alpha/", quarter: "2026-q4" }, metadata, missingTree: true });
  expect(await store.lookup({ kind: "slug", slug: reference.owner.name })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
});

it.each([
  { label: "absent", metadata: null, condition: /no metadata entry/u },
  { label: "unparseable", metadata: "not JSON", condition: /cannot be parsed/u },
])("keeps $label owner metadata terminal during slug lookup", async ({ metadata, condition }) => {
  const { store, reference } = refObjectReadFixture({ metadata });
  expect(await store.lookup({ kind: "slug", slug: reference.owner.name })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", condition, remedy: { text: expect.stringContaining("forward") },
  } });
});

it("keeps unavailable registry metadata recoverable when resolving a retained lineage name", async () => {
  const { store, lineage } = registryLineageFixture({ missingMetadata: true });
  expect(await store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
});

it("keeps unavailable live owner metadata recoverable when resolving a lineage name", async () => {
  const { store, reference } = refObjectReadFixture({ missingMetadata: true });
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: reference.owner.name } });
  expect(await store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [],
    remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
});

it.each([
  { label: "absent", metadata: null, condition: /no metadata entry/u },
  { label: "unparseable", metadata: "not JSON", condition: /cannot be parsed/u },
])("keeps $label live owner metadata terminal when resolving a lineage name", async ({ metadata, condition }) => {
  const { store, reference } = refObjectReadFixture({ metadata });
  const lineage = RecordReferenceSchema.parse({ kind: "lineage/transition", owner: { type: "work-item", name: reference.owner.name } });
  expect(await store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", condition, remedy: { text: expect.stringContaining("forward") },
  } });
});

it.each([
  { label: "absent", metadata: null, condition: /no metadata entry/u },
  { label: "unparseable", metadata: "not JSON", condition: /cannot be parsed/u },
])("keeps $label registry metadata terminal when resolving a retained lineage name", async ({ metadata, condition }) => {
  const { store, lineage } = registryLineageFixture({ metadata });
  expect(await store.read({ reference: lineage })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", condition, remedy: { text: expect.stringContaining("forward") },
  } });
});

it.each([true, false])("uses current live presence for a missing saved lookup object (live=%s)", async live => {
  const { store, reference, version, emptyVersion } = refObjectReadFixture({ missingMetadata: true, live });
  const named = RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name: reference.owner.name } });
  expect(await store.changes({ from: emptyVersion, to: version, references: [named] })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: live ? [] : [`refs/arc/history/work/${metadataUid}`],
  } });
});

it("rejects a live cohort's metadata without its required slug", async () => {
  const { store, reference } = refObjectReadFixture({ namespace: `refs/arc/cohort/${metadataUid}`,
    metadata: JSON.stringify({ formatVersion: 1, formats: {} }), recordPath: "cohort-alpha.md", recordContent: "# Cohort: alpha\n",
  });
  expect(await store.lookup({ kind: "slug", slug: reference.owner.name })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", condition: expect.stringContaining("cannot be parsed"),
    remedy: { text: expect.stringContaining("forward") },
  } });
});
