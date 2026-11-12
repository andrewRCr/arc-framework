/** Narrative internal origins preserve their authored Markdown through metadata projection. */
import { expect, it } from "vitest";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { MetaOriginSchema } from "../../../src/lib/active/meta-schema.js";
import { parseMetaRecord, parseMetaProjectionRecord } from "../../../src/lib/active/meta-reader.js";
import { writeMetaOrigin } from "../../../src/lib/store/kinds/meta/bullet-writers.js";

const origin = "[internal] — split the `catalog` entry after **review** (2026-10-16)";

it.each(["\n", "\r\n"])("renders a schema-admitted narrative Origin unwrapped with %j endings", ending => {
  expect(MetaOriginSchema.parse(origin)).toBe(origin);
  const content = makeMetaFixture("sample", { origin }).replace(/\n/gu, ending);
  expect(content).toContain(`- **Origin:** ${origin}${ending}`);
  expect(parseMetaRecord(content).origin).toBe(origin);
});

it.each(["\n", "\r\n"])("reads an authored narrative Origin without removing its code spans with %j endings", ending => {
  const content = makeMetaFixture("sample").replace("- **Origin:** [internal]", `- **Origin:** ${origin}`).replace(/\n/gu, ending);
  expect(parseMetaProjectionRecord(content).Origin).toBe(origin);
  expect(parseMetaRecord(content).origin).toBe(origin);
});

it.each(["\n", "\r\n"])("updates only the Origin bullet while preserving narrative code spans and %j endings", ending => {
  const before = (makeMetaFixture("sample") + "\n## Research\n\nKeep `authored` prose.\n").replace(/\n/gu, ending);
  const written = writeMetaOrigin(before, origin);
  expect(written).toBe(before.replace("- **Origin:** [internal]", `- **Origin:** ${origin}`));
  expect(parseMetaRecord(written).origin).toBe(origin);
});
