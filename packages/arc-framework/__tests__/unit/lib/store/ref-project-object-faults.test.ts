import { expect, it } from "vitest";

import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import { refObjectReadFixture } from "../../../helpers/store/ref-object-read.js";
import { expandStoredPath } from "../../../../src/lib/store/stored-path.js";

const projectId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });

function projectFixture(options: NonNullable<Parameters<typeof refObjectReadFixture>[0]> = {}) {
  return refObjectReadFixture({ namespace: "refs/arc/project/registry", metadataName: "metadata-registry.json",
    metadata: JSON.stringify({ formatVersion: 1, formats: {} }), recordPath: "identity.json", recordContent: JSON.stringify({ projectId }),
    ...options,
  });
}

it("keeps an unavailable project identity blob recoverable", async () => {
  const { store } = projectFixture({ missingRecord: true });
  expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
});

it("keeps an unavailable registry tree recoverable", async () => {
  const { store } = projectFixture({ missingTree: true });
  expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
  } });
});

it("keeps project records addressable without a UID when the registry has no identity entry", async () => {
  const counter = RecordReferenceSchema.parse({ kind: "project-registry/counter", owner: { type: "project", name: "project" }, key: "one" });
  const { store } = projectFixture({ recordPath: expandStoredPath(counter).path, recordContent: "{}" });
  const result = await store.read({ reference: counter });
  expect(result).toMatchObject({ status: "ok", result: { reference: counter, content: "{}" } });
  if (result.status !== "ok") throw new Error("Expected project record");
  expect(result.result.reference.owner).not.toHaveProperty("uid");
});

it.each([
  { label: "invalid JSON", options: { recordContent: "not JSON" } },
  { label: "a tree object", options: { recordPath: "identity.json/child", recordContent: "{}" } },
])("keeps present identity data containing $label as record-malformed", async ({ options }) => {
  const { store } = projectFixture(options);
  expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference, rule: "store.project-identity",
    remedy: { text: expect.stringContaining("forward") },
  } });
});

it("keeps malformed saved identity data tied to a historical repair", async () => {
  const { store, version } = projectFixture({ recordContent: "not JSON" });
  expect(await store.read({ reference, asOf: version })).toMatchObject({ status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference, rule: "store.project-identity",
    remedy: { text: expect.stringContaining("ancestor") },
  } });
});
